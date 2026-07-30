import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FlightController } from "./flight/controller.js";
import { FlightInput } from "./flight/input.js";
import { ChaseCameraRig } from "./flight/chase-camera.js";
import { FlightCollisionResolver } from "./flight/collision.js";
import { DragonRuntime } from "./dragon/runtime.js";
import { buildArchipelago, updateActiveIslands } from "./world/archipelago.js";
import { loadGame, saveGame, safeRespawn } from "./core/save.js";

const ASSETS = Object.freeze({
  dragon: "../greyblue-dragon-flight-m1/dragon.glb",
  isle: "../greyblue-dragon-flight-m1/isle.glb",
});
const STREAMING_RANGES = Object.freeze({ activateRange: 2400, deactivateRange: 3000 });
const FALLBACK_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });

const stateLine = document.querySelector("#state");
const errorLine = document.querySelector("#error");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x71848b);
scene.fog = new THREE.FogExp2(0x71848b, 0.00042);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 24000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfd8df, 0x202a28, 2.4));
const sun = new THREE.DirectionalLight(0xffefd0, 3.2);
sun.position.set(500, 900, -350);
sun.castShadow = true;
scene.add(sun);

const save = loadGame();
const seed = Number.isInteger(save?.seed) ? save.seed : 1337;
const world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
const discovered = new Set(save?.discovered || []);
const position = new THREE.Vector3(
  save?.position?.x ?? FALLBACK_SPAWN.x,
  save?.position?.y ?? FALLBACK_SPAWN.y,
  save?.position?.z ?? FALLBACK_SPAWN.z,
);

const controller = new FlightController();
Object.assign(controller.velocity, save?.velocity || {});
controller.yaw = save?.orientation?.yaw ?? 0;
controller.pitch = save?.orientation?.pitch ?? 0;
controller.bank = save?.orientation?.bank ?? 0;
controller.airborne = save?.airborne ?? true;
controller.landingRequested = save?.landingRequested ?? false;
const flightInput = new FlightInput();
const chaseCamera = new ChaseCameraRig({ distance: save?.settings?.cameraDistance ?? 24 });
const collisionResolver = new FlightCollisionResolver();
collisionResolver.reset(position);
let lastCollision = { ...collisionResolver.telemetry };
let dragon = null;
let dragonRuntime = null;
let mixer = null;
let heroIsle = null;
let heroBounds = null;
let lastSaveAt = performance.now();
let lastFrameAt = performance.now();
let latestDiscovery = null;
let currentRegion = null;
const islandMeshes = new Map();
const loader = new GLTFLoader();

function loadGltf(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function makeIslandMesh(island) {
  const geometry = new THREE.ConeGeometry(110 * island.scale, island.height, 9, 3);
  geometry.translate(0, -island.height * 0.42, 0);
  const material = new THREE.MeshStandardMaterial({
    color: island.landmark ? 0x607f74 : 0x536e64,
    roughness: 0.96,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(island.x, 0, island.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.island = island;
  return mesh;
}

function updateStreaming() {
  const activeIds = new Set(islandMeshes.keys());
  const active = updateActiveIslands(world, position, activeIds, STREAMING_RANGES);
  const wanted = new Set(active.map((island) => island.id));
  for (const island of active) {
    if (!islandMeshes.has(island.id)) {
      const mesh = makeIslandMesh(island);
      islandMeshes.set(island.id, mesh);
      scene.add(mesh);
    }
  }
  for (const [id, mesh] of islandMeshes) {
    if (!wanted.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      islandMeshes.delete(id);
    }
  }
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
  if (heroBounds && x >= heroBounds.min.x && x <= heroBounds.max.x && z >= heroBounds.min.z && z <= heroBounds.max.z) {
    const height = heroBounds.min.y + 4;
    if (result.surface === "water" || height > result.height) {
      result = { height, surface: "terrain", id: "greyblue-isle" };
    }
  }
  return result;
}

function terrainHeightAt(x, z) {
  return sampleSurfaceAt(x, z).height;
}

function recover() {
  const recovered = safeRespawn({
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    velocity: { ...controller.velocity },
    orientation: { yaw: controller.yaw, pitch: controller.pitch, bank: controller.bank },
    airborne: controller.airborne,
    landingRequested: controller.landingRequested,
    discovered,
  }, FALLBACK_SPAWN);
  position.set(recovered.position.x, recovered.position.y, recovered.position.z);
  Object.assign(controller.velocity, recovered.velocity);
  controller.yaw = recovered.orientation.yaw;
  controller.pitch = recovered.orientation.pitch;
  controller.bank = recovered.orientation.bank;
  controller.airborne = recovered.airborne;
  controller.landingRequested = recovered.landingRequested;
  collisionResolver.reset(recovered.position);
  lastCollision = { ...collisionResolver.telemetry };
  chaseCamera.snapTo(position, controller.yaw);
  persist();
}

function persist() {
  saveGame({
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    velocity: { ...controller.velocity },
    orientation: { yaw: controller.yaw, pitch: controller.pitch, bank: controller.bank },
    airborne: controller.airborne,
    landingRequested: controller.landingRequested,
    discovered,
    settings: { cameraDistance: chaseCamera.distance },
  });
  lastSaveAt = performance.now();
}

addEventListener("keydown", (event) => {
  flightInput.keyDown(event.code, event.repeat);
});
addEventListener("keyup", (event) => flightInput.keyUp(event.code));
addEventListener("blur", () => flightInput.clear());
addEventListener("beforeunload", persist);
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
  chaseCamera.snapTo(position, controller.yaw);

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
  if (input.recover) recover();

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
    dt,
    sampleHeight: terrainHeightAt,
  });
  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.lookAt(cameraState.lookTarget.x, cameraState.lookTarget.y, cameraState.lookTarget.z);
  dragonRuntime?.update(dt);

  if (now - lastSaveAt > 12000) persist();
  const speed = flightState.speed;
  const regionLabel = currentRegion?.name ? ` · ${currentRegion.name}` : "";
  stateLine.textContent = `${controller.airborne ? "FLIGHT" : "LANDED"} · ${Math.round(speed)} speed · ${Math.round(position.y)} altitude · ${discovered.size} discovered${regionLabel}`;

  globalThis.__greyblueState = {
    ready: Boolean(dragon && heroIsle),
    dragonLoaded: Boolean(dragon),
    isleLoaded: Boolean(heroIsle),
    seed,
    position: { x: position.x, y: position.y, z: position.z },
    flight: flightState,
    collision: lastCollision,
    input: {
      source: input.source,
      throttle: input.throttle,
      steer: input.steer,
      climb: input.climb,
    },
    animation: dragonRuntime?.telemetry || null,
    camera: cameraState,
    activeIslandCount: islandMeshes.size,
    activeIslandIds: active.map((island) => island.id),
    discoveredCount: discovered.size,
    discovered: [...discovered],
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
