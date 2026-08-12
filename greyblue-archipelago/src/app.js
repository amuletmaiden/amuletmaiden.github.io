import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FlightController } from "./flight/controller.js";
import { FlightInput } from "./flight/input.js";
import { ChaseCameraRig } from "./flight/chase-camera.js";
import { FreeLookChaseCamera } from "./flight/camera-free-look-integration.js";
import { FlightCollisionResolver } from "./flight/collision.js";
import { createIsleTerrainSampler } from "./flight/isle-terrain-sampler.js";
import { DragonRuntime } from "./dragon/runtime.js";
import { buildArchipelago, updateActiveIslands } from "./world/archipelago.js";
import { selectRouteGuidance } from "./core/route-guidance.js";
import { cycleRouteChoice } from "./core/route-choice.js";
import { evaluateMysteryRouteUnlocks } from "./core/mystery-route-unlock.js";
import { createStreamedIslandPool } from "./core/streamed-island-pool.js";
import { createStreamedIslandThreeAdapter } from "./core/streamed-island-three-adapter.js";
import { loadGame, saveGame, safeRespawn } from "./core/save.js";

const ASSETS = Object.freeze({
  dragon: "../greyblue-dragon-flight-m1/dragon.glb",
  isle: "../greyblue-dragon-flight-m1/isle.glb",
});
const STREAMING_RANGES = Object.freeze({ activateRange: 2400, deactivateRange: 3000 });
const FALLBACK_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });
const ROUTE_CHOICE_RADIUS = 320;
const CROSSING_COMMIT_PROGRESS = 0.1;
const DEFAULT_FOG = Object.freeze({
  color: "#71848b",
  near: 120,
  far: 2100,
  density: 0.00042,
  altitudeThinning: 1000,
  transitionDistance: 800,
});

const stateLine = document.querySelector("#state");
const errorLine = document.querySelector("#error");
const routeChoiceStatus = document.querySelector("#route-choice-status");
const scene = new THREE.Scene();
scene.background = new THREE.Color(DEFAULT_FOG.color);
scene.fog = new THREE.FogExp2(DEFAULT_FOG.color, DEFAULT_FOG.density);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 24000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const reducedMotionQuery = typeof matchMedia === "function"
  ? matchMedia("(prefers-reduced-motion: reduce)")
  : null;

scene.add(new THREE.HemisphereLight(0xbfd8df, 0x202a28, 2.4));
const sun = new THREE.DirectionalLight(0xffefd0, 3.2);
sun.position.set(500, 900, -350);
sun.castShadow = true;
scene.add(sun);

const save = loadGame();
const seed = Number.isInteger(save?.seed) ? save.seed : 1337;
const world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
const discovered = new Set(save?.discovered || []);
const discoveredRoutes = new Set(save?.discoveredRoutes || []);
const mysteryExploration = {
  events: Array.isArray(save?.exploration?.events) ? [...save.exploration.events] : [],
};
const position = new THREE.Vector3(
  save?.position?.x ?? FALLBACK_SPAWN.x,
  save?.position?.y ?? FALLBACK_SPAWN.y,
  save?.position?.z ?? FALLBACK_SPAWN.z,
);

const controller = new FlightController();
controller.airborne = true;
const flightInput = new FlightInput();
const chaseCamera = new FreeLookChaseCamera(
  new ChaseCameraRig({ distance: save?.settings?.cameraDistance ?? 24 }),
);
const collisionResolver = new FlightCollisionResolver();
collisionResolver.reset(position);
let lastCollision = { ...collisionResolver.telemetry };
let dragon = null;
let dragonRuntime = null;
let mixer = null;
let heroIsle = null;
let heroBounds = null;
let heroTerrain = null;
let paused = false;
let cameraPointerId = null;
let lastCameraState = null;
let lastSaveAt = performance.now();
let lastFrameAt = performance.now();
let latestDiscovery = null;
let currentRegion = null;
let currentFogProfile = { ...DEFAULT_FOG };
let currentRouteGuidance = null;
let preferredRouteId = save?.guidance?.activeRouteId || null;
let activeCrossingRouteId = null;
let routeChoiceTelemetry = Object.freeze({ available: false, reason: "not-at-departure", preferredRouteId });
let mysteryRouteTelemetry = Object.freeze({
  unlockedRouteIds: [],
  regionProgress: [],
  investigationCount: 0,
  lastUnlockedRouteId: null,
});
const islandMeshes = new Map();
const streamedIslandThreeAdapter = createStreamedIslandThreeAdapter({ THREE, scene, islandMeshes });
const streamedIslandPresentation = createStreamedIslandPool({
  cap: 12,
  create: streamedIslandThreeAdapter.create,
  reset: streamedIslandThreeAdapter.reset,
  dispose: streamedIslandThreeAdapter.dispose,
});
const loader = new GLTFLoader();

function loadGltf(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function updateStreaming() {
  const activeIds = new Set(islandMeshes.keys());
  const active = updateActiveIslands(world, position, activeIds, STREAMING_RANGES);
  streamedIslandPresentation.sync(active);
  return active;
}

function nearestIsland() {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const island of world.islands) {
    const distance = Math.hypot(position.x - island.x, position.z - island.z);
    if (distance < nearestDistance) {
      nearest = island;
      nearestDistance = distance;
    }
  }
  return nearest ? { island: nearest, distance: nearestDistance } : null;
}

function nearestLandingZone(island) {
  if (!island?.landingZones?.length) return null;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const zone of island.landingZones) {
    const distance = Math.hypot(position.x - zone.x, position.z - zone.z);
    if (distance < nearestDistance) {
      nearest = zone;
      nearestDistance = distance;
    }
  }
  return nearest ? { ...nearest, distance: nearestDistance } : null;
}

function sampleSurfaceAt(x, z) {
  let result = { height: 0, surface: "water", id: "greyblue-ocean" };
  for (const island of world.islands) {
    const distance = Math.hypot(x - island.x, z - island.z);
    const radius = 110 * island.scale;
    if (distance < radius) {
      const normalized = 1 - distance / radius;
      const height = island.height * normalized * normalized * 0.58;
      if (result.surface === "water" || height > result.height) {
        result = { height, surface: "terrain", id: island.id };
      }
    }
  }

  const sampledIsleHeight = heroTerrain?.sample(x, z);
  if (Number.isFinite(sampledIsleHeight) && (result.surface === "water" || sampledIsleHeight > result.height)) {
    result = { height: sampledIsleHeight, surface: "terrain", id: "greyblue-isle" };
  } else if (!heroTerrain && heroBounds
    && x >= heroBounds.min.x && x <= heroBounds.max.x
    && z >= heroBounds.min.z && z <= heroBounds.max.z) {
    const height = heroBounds.min.y + 4;
    if (result.surface === "water" || height > result.height) {
      result = { height, surface: "terrain", id: "greyblue-isle-fallback" };
    }
  }
  return result;
}

function terrainHeightAt(x, z) {
  return sampleSurfaceAt(x, z).height;
}

function clearCameraLook() {
  cameraPointerId = null;
  flightInput.clearPointerLook();
  chaseCamera.resetLook();
}

function recover() {
  const recovered = safeRespawn({
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    velocity: { ...controller.velocity },
    airborne: controller.airborne,
    landingRequested: controller.landingRequested,
    discovered,
    discoveredRoutes,
    guidance: {
      activeRouteId: preferredRouteId,
      progress: currentRouteGuidance?.progress ?? 0,
    },
  }, FALLBACK_SPAWN);
  position.set(recovered.position.x, recovered.position.y, recovered.position.z);
  Object.assign(controller.velocity, recovered.velocity);
  controller.airborne = recovered.airborne;
  controller.landingRequested = recovered.landingRequested;
  collisionResolver.reset(recovered.position);
  lastCollision = { ...collisionResolver.telemetry };
  chaseCamera.snapTo(position, controller.yaw);
  cameraPointerId = null;
  flightInput.clearPointerLook();
  activeCrossingRouteId = null;
  persist();
}

function persist() {
  saveGame({
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    discovered,
    discoveredRoutes,
    guidance: {
      activeRouteId: preferredRouteId,
      progress: currentRouteGuidance?.progress ?? 0,
    },
    settings: { cameraDistance: chaseCamera.distance },
  });
  lastSaveAt = performance.now();
}

function setPaused(nextPaused, now) {
  paused = Boolean(nextPaused);
  flightInput.clear();
  clearCameraLook();
  lastFrameAt = now;
  if (paused) persist();
}

function updateFog(dt) {
  const target = currentRegion?.fogProfile || DEFAULT_FOG;
  const targetColor = new THREE.Color(target.color || DEFAULT_FOG.color);
  const altitudeScale = clamp(1 - Math.max(0, position.y) / Math.max(1, target.altitudeThinning || 1000) * 0.58, 0.34, 1);
  const targetDensity = (target.density || DEFAULT_FOG.density) * altitudeScale;
  const transitionSeconds = clamp((target.transitionDistance || 800) / 1400, 0.35, 1.8);
  const blend = 1 - Math.exp(-Math.max(0, dt) / transitionSeconds);
  scene.fog.color.lerp(targetColor, blend);
  scene.background.lerp(targetColor, blend * 0.65);
  scene.fog.density += (targetDensity - scene.fog.density) * blend;
  currentFogProfile = {
    ...target,
    effectiveDensity: scene.fog.density,
    altitudeScale,
  };
}

function discoverRoutes() {
  for (const route of world.routes) {
    const discovery = route.discovery;
    if (!discovery || discoveredRoutes.has(route.id)) continue;
    const distance = Math.hypot(position.x - discovery.midpoint.x, position.z - discovery.midpoint.z);
    if (distance >= discovery.revealRadius) continue;
    discoveredRoutes.add(route.id);
    latestDiscovery = {
      ...discovery,
      routeId: route.id,
      kind: route.kind,
      discoveredAt: Date.now(),
    };
  }
}

function updateRouteGuidance(proximity) {
  if (!proximity || proximity.distance > 760) {
    currentRouteGuidance = null;
    return null;
  }

  const selection = selectRouteGuidance({
    world,
    island: {
      ...proximity.island,
      position: { x: position.x, z: position.z },
    },
    discoveredRouteIds: discoveredRoutes,
    altitude: position.y,
    preferredRouteId,
    preferredRegionId: currentRegion?.id || null,
  });
  preferredRouteId = selection.preferredRouteId;

  if (!selection.guidance) {
    currentRouteGuidance = null;
    return null;
  }

  const headingError = normalizeAngle(selection.guidance.bearing - controller.yaw);
  currentRouteGuidance = {
    ...selection.guidance,
    destinationId: selection.guidance.destinationIslandId,
    headingError,
    turn: Math.abs(headingError) < 0.12 ? "ahead" : headingError > 0 ? "right" : "left",
    altitudeMargin: position.y - selection.guidance.minimumAltitude,
  };
  return currentRouteGuidance;
}

function setRouteChoiceStatus(message) {
  if (routeChoiceStatus) routeChoiceStatus.textContent = String(message || "").slice(0, 180);
}

function applyMysteryRouteUnlock(liveInvestigation = null) {
  if (liveInvestigation?.landmarkId && liveInvestigation?.regionId) {
    const duplicate = mysteryExploration.events.some((event) =>
      event?.kind === "landmark-investigated" && event.landmarkId === liveInvestigation.landmarkId);
    if (!duplicate) {
      mysteryExploration.events.push({
        kind: "landmark-investigated",
        landmarkId: liveInvestigation.landmarkId,
        regionId: liveInvestigation.regionId,
      });
    }
  }

  const result = evaluateMysteryRouteUnlocks({
    world,
    exploration: mysteryExploration,
    discoveredIslandIds: discovered,
    discoveredRouteIds: discoveredRoutes,
    liveInvestigation,
  });
  const unlockedRouteIds = [];
  for (const unlock of result.unlocks) {
    if (discoveredRoutes.has(unlock.routeId)) continue;
    discoveredRoutes.add(unlock.routeId);
    unlockedRouteIds.push(unlock.routeId);
  }

  mysteryRouteTelemetry = Object.freeze({
    unlockedRouteIds: Object.freeze(unlockedRouteIds),
    regionProgress: result.regionProgress,
    investigationCount: result.investigationCount,
    lastUnlockedRouteId: unlockedRouteIds.at(-1) ?? mysteryRouteTelemetry.lastUnlockedRouteId ?? null,
  });

  if (!unlockedRouteIds.length) return false;
  const proximity = nearestIsland();
  updateRouteGuidance(proximity);
  persist();
  const route = world.routes.find((candidate) => candidate.id === unlockedRouteIds[0]);
  const destination = route
    ? world.islands.find((island) => island.id === route.toIslandId || island.id === route.fromIslandId)
    : null;
  setRouteChoiceStatus(destination?.name
    ? `A hidden crossing resonates into view near ${destination.name}.`
    : "A hidden crossing resonates into view.");
  return true;
}

function chooseNextRoute() {
  const proximity = nearestIsland();
  if (!proximity || proximity.distance > ROUTE_CHOICE_RADIUS) {
    routeChoiceTelemetry = Object.freeze({ available: false, reason: "not-at-departure", preferredRouteId });
    setRouteChoiceStatus("Route choice is available near a discovered departure.");
    return false;
  }

  const result = cycleRouteChoice({
    world,
    islandId: proximity.island.id,
    discoveredRouteIds: discoveredRoutes,
    preferredRouteId,
    activeCrossingRouteId,
  });
  routeChoiceTelemetry = Object.freeze({
    available: result.choices.length > 0,
    reason: result.reason,
    preferredRouteId: result.preferredRouteId,
    choiceCount: result.choices.length,
    departureIslandId: proximity.island.id,
  });

  if (result.reason === "active-crossing") {
    setRouteChoiceStatus("Finish or clear the active crossing before choosing another route.");
    return false;
  }
  if (result.reason === "no-eligible-routes") {
    setRouteChoiceStatus("No discovered crossing leaves this island yet.");
    return false;
  }

  preferredRouteId = result.preferredRouteId;
  updateRouteGuidance(proximity);
  persist();
  setRouteChoiceStatus(result.destinationName ? `Route set for ${result.destinationName}.` : "Route selected.");
  return result.changed;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function publishPausedState() {
  const flightState = controller.snapshot();
  const surface = sampleSurfaceAt(position.x, position.z);
  stateLine.textContent = `PAUSED · ${controller.airborne ? "FLIGHT" : "LANDED"} · Greyblue Archipelago`;
  globalThis.__greyblueState = {
    ...(globalThis.__greyblueState || {}),
    ready: Boolean(dragon && heroIsle),
    dragonLoaded: Boolean(dragon),
    isleLoaded: Boolean(heroIsle),
    paused: true,
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    flight: flightState,
    collision: lastCollision,
    surface,
    camera: lastCameraState,
    cameraLook: lastCameraState?.freeLook || Object.freeze({ active: false, direction: null }),
    routeGuidance: currentRouteGuidance,
    guidancePreference: preferredRouteId,
    routeChoice: routeChoiceTelemetry,
    mysteryRoutes: mysteryRouteTelemetry,
    world: {
      ...(globalThis.__greyblueState?.world || {}),
      streamingPresentation: streamedIslandPresentation.telemetry(),
      heroTerrain: heroTerrain?.telemetry || null,
    },
  };
}

addEventListener("keydown", (event) => {
  if (!event.defaultPrevented && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.code === "KeyC") chooseNextRoute();
    if (event.code === "KeyX") {
      activeCrossingRouteId = null;
      routeChoiceTelemetry = Object.freeze({ ...routeChoiceTelemetry, reason: "crossing-cleared" });
    }
  }
  flightInput.keyDown(event.code, event.repeat);
});
addEventListener("greyblue:route-completed", () => {
  activeCrossingRouteId = null;
  routeChoiceTelemetry = Object.freeze({ ...routeChoiceTelemetry, reason: "crossing-completed" });
});
addEventListener("greyblue:landmark-investigated", (event) => {
  applyMysteryRouteUnlock(event?.detail ?? null);
});
addEventListener("keyup", (event) => flightInput.keyUp(event.code));
addEventListener("blur", () => {
  flightInput.clear();
  clearCameraLook();
});
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (paused || event.button !== 0 || cameraPointerId !== null) return;
  cameraPointerId = event.pointerId;
  flightInput.clearPointerLook();
  renderer.domElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (cameraPointerId !== event.pointerId) return;
  flightInput.pointerDelta(event.movementX, event.movementY);
  event.preventDefault();
});
const finishPointerLook = (event) => {
  if (cameraPointerId !== event.pointerId) return;
  if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
    renderer.domElement.releasePointerCapture?.(event.pointerId);
  }
  cameraPointerId = null;
  flightInput.clearPointerLook();
};
renderer.domElement.addEventListener("pointerup", finishPointerLook);
renderer.domElement.addEventListener("pointercancel", finishPointerLook);
renderer.domElement.addEventListener("lostpointercapture", (event) => {
  if (cameraPointerId !== event.pointerId) return;
  cameraPointerId = null;
  flightInput.clearPointerLook();
});
addEventListener("beforeunload", () => {
  streamedIslandPresentation.teardown();
  persist();
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

async function boot() {
  const [dragonGltf, isleGltf] = await Promise.all([loadGltf(ASSETS.dragon), loadGltf(ASSETS.isle)]);
  dragon = dragonGltf.scene;
  heroIsle = isleGltf.scene;
  scene.add(heroIsle, dragon);

  heroIsle.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  dragon.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });

  const isleBox = new THREE.Box3().setFromObject(heroIsle);
  const isleCenter = isleBox.getCenter(new THREE.Vector3());
  heroIsle.position.sub(isleCenter);
  heroBounds = new THREE.Box3().setFromObject(heroIsle);
  heroTerrain = createIsleTerrainSampler({ THREE, root: heroIsle, bounds: heroBounds });

  const dragonBox = new THREE.Box3().setFromObject(dragon);
  const isleSize = heroBounds.getSize(new THREE.Vector3());
  const dragonSize = dragonBox.getSize(new THREE.Vector3());
  const dragonScale = Math.max(1, Math.min(isleSize.x, isleSize.y, isleSize.z) / Math.max(dragonSize.x, dragonSize.y, dragonSize.z) * 0.018);
  dragon.scale.setScalar(dragonScale);

  mixer = dragonGltf.animations.length ? new THREE.AnimationMixer(dragon) : null;
  dragonRuntime = new DragonRuntime(dragon, mixer);
  dragonRuntime.bindClips(dragonGltf.animations);
  collisionResolver.reset(position);
  lastCollision = { ...collisionResolver.telemetry };
  applyMysteryRouteUnlock();

  stateLine.textContent = "FLIGHT · Greyblue Archipelago";
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;

  const gamepads = typeof navigator.getGamepads === "function"
    ? Array.from(navigator.getGamepads())
    : [];
  flightInput.setGamepad(gamepads.find(Boolean) || null);
  const input = flightInput.sample();

  if (input.pause) {
    setPaused(!paused, now);
    if (paused) publishPausedState();
    renderer.render(scene, camera);
    return;
  }
  if (paused) {
    publishPausedState();
    renderer.render(scene, camera);
    return;
  }
  const recovering = Boolean(input.recover);
  if (recovering) recover();

  const previous = { x: position.x, y: position.y, z: position.z };
  const flight = controller.step(input, dt);
  const proposed = {
    x: previous.x + flight.velocity.x * dt,
    y: previous.y + flight.velocity.y * dt,
    z: previous.z + flight.velocity.z * dt,
  };
  const collision = collisionResolver.resolve({
    previous,
    proposed,
    velocity: flight.velocity,
    sampleSurface: sampleSurfaceAt,
    landingRequested: controller.landingRequested,
    airborne: controller.airborne,
  });
  position.set(collision.position.x, collision.position.y, collision.position.z);
  Object.assign(controller.velocity, collision.velocity);
  lastCollision = { ...collision.telemetry };

  if (collision.requiresRecovery) {
    recover();
  } else if (collision.grounded) {
    controller.airborne = false;
    controller.landingRequested = false;
    controller.velocity.y = 0;
    controller.stallFactor = 0;
  } else if (collision.collided) {
    controller.airborne = true;
    controller.landingRequested = false;
  }

  if (position.y < -20 || !Number.isFinite(position.lengthSq())) recover();
  const active = updateStreaming();
  const proximity = nearestIsland();
  currentRegion = proximity
    ? world.regions.find((region) => region.id === proximity.island.regionId) || null
    : null;
  updateFog(dt);

  for (const island of world.islands) {
    const threshold = island.discovery?.threshold ?? 260;
    if (!discovered.has(island.id) && Math.hypot(position.x - island.x, position.z - island.z) < threshold) {
      discovered.add(island.id);
      latestDiscovery = {
        ...island.discovery,
        islandId: island.id,
        landmark: island.landmarkRecord,
        discoveredAt: Date.now(),
      };
    }
  }
  discoverRoutes();
  const routeGuidance = updateRouteGuidance(proximity);
  if (!activeCrossingRouteId && routeGuidance?.routeId && routeGuidance.progress >= CROSSING_COMMIT_PROGRESS) {
    activeCrossingRouteId = routeGuidance.routeId;
    routeChoiceTelemetry = Object.freeze({ ...routeChoiceTelemetry, reason: "active-crossing", preferredRouteId });
  }

  if (dragon) {
    dragon.position.copy(position);
    dragon.rotation.set(controller.pitch, controller.yaw + Math.PI, -controller.bank, "YXZ");
  }
  const flightState = controller.snapshot();
  const clip = dragonRuntime?.updateFromFlight(flightState) || null;

  const cameraState = chaseCamera.update({
    target: position,
    yaw: controller.yaw,
    bank: controller.bank,
    speed: flightState.speed,
    grounded: collision.grounded,
    dt,
    sampleHeight: terrainHeightAt,
    lookX: input.lookX,
    lookY: input.lookY,
    interrupted: recovering || collision.requiresRecovery,
    reducedMotion: Boolean(reducedMotionQuery?.matches),
  });
  lastCameraState = cameraState;
  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.lookAt(cameraState.lookTarget.x, cameraState.lookTarget.y, cameraState.lookTarget.z);
  dragonRuntime?.update(dt);

  if (now - lastSaveAt > 12000) persist();
  const speed = flightState.speed;
  const regionLabel = currentRegion?.name ? ` · ${currentRegion.name}` : "";
  const routeLabel = routeGuidance
    ? ` · ${routeGuidance.destinationName} ${routeGuidance.turn} · ${routeGuidance.fogRisk.level} fog`
    : "";
  stateLine.textContent = `${controller.airborne ? "FLIGHT" : "LANDED"} · ${Math.round(speed)} speed · ${Math.round(position.y)} altitude · ${discovered.size} isles · ${discoveredRoutes.size} routes${regionLabel}${routeLabel}`;

  const surface = sampleSurfaceAt(position.x, position.z);
  globalThis.__greyblueState = {
    ready: Boolean(dragon && heroIsle),
    dragonLoaded: Boolean(dragon),
    isleLoaded: Boolean(heroIsle),
    paused: false,
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    flight: flightState,
    collision: lastCollision,
    surface,
    input: {
      source: input.source,
      throttle: input.throttle,
      steer: input.steer,
      climb: input.climb,
    },
    animation: dragonRuntime?.telemetry || null,
    camera: cameraState,
    cameraLook: cameraState.freeLook,
    fog: currentFogProfile,
    routeGuidance: currentRouteGuidance,
    guidancePreference: preferredRouteId,
    routeChoice: routeChoiceTelemetry,
    mysteryRoutes: mysteryRouteTelemetry,
    activeIslandCount: islandMeshes.size,
    activeIslandIds: active.map((island) => island.id),
    discoveredCount: discovered.size,
    discovered: [...discovered],
    discoveredRouteCount: discoveredRoutes.size,
    discoveredRoutes: [...discoveredRoutes],
    latestDiscovery,
    currentRegion,
    nearestIsland: proximity
      ? {
          id: proximity.island.id,
          name: proximity.island.name,
          regionId: proximity.island.regionId,
          distance: proximity.distance,
          landingZone: nearestLandingZone(proximity.island),
          approachCorridors: proximity.island.approachCorridors,
        }
      : null,
    world: {
      regionCount: world.regions.length,
      routeCount: world.routes.length,
      islandCount: world.islands.length,
      streaming: STREAMING_RANGES,
      streamingPresentation: streamedIslandPresentation.telemetry(),
      heroTerrain: heroTerrain?.telemetry || null,
    },
    clip,
  };

  renderer.render(scene, camera);
}

boot().catch((error) => {
  console.error(error);
  stateLine.textContent = "BOOT FAILED";
  errorLine.textContent = error instanceof Error ? error.message : String(error);
  globalThis.__greyblueState = { ready: false, error: errorLine.textContent };
});