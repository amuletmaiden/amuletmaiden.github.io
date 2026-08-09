import * as THREE from "three";
import { buildArchipelago } from "../world/archipelago.js";
import { loadGame } from "./save.js";
import { evaluateLocalFamiliarity } from "./local-familiarity.js";

const restored = loadGame();
const explorationEvents = Array.isArray(restored?.exploration?.events)
  ? restored.exploration.events.map((event) => ({ ...event }))
  : [];
const eventKeys = new Set(explorationEvents.map((event) => {
  const id = event?.id || event?.landmarkId || event?.routeId || event?.corridorId || event?.regionId || "";
  return `${event?.kind || ""}:${id}`;
}));
let world = null;
let worldSeed = null;
let latestFamiliarity = Object.freeze({
  familiarity: 0,
  densityMultiplier: 1,
  nearContrast: 0,
  strongestSource: 0,
  sourceCount: 0,
  radius: 1800,
});
let currentState = null;
let arrivalMistMultiplier = 1;
let arrivalMistClass = null;
let arrivalMistTimer = 0;

function addExplorationEvent(event) {
  if (!event || typeof event !== "object") return false;
  const kind = typeof event.kind === "string" ? event.kind.trim() : "";
  const id = event.id || event.landmarkId || event.routeId || event.corridorId || event.regionId || "";
  if (!kind || typeof id !== "string" || !id.trim()) return false;
  const key = `${kind}:${id.trim()}`;
  if (eventKeys.has(key)) return false;
  eventKeys.add(key);
  explorationEvents.push({ ...event, kind });
  if (explorationEvents.length > 512) explorationEvents.shift();
  return true;
}

function ensureWorld(seed) {
  const nextSeed = Number.isInteger(seed) ? seed : 1337;
  if (world && worldSeed === nextSeed) return world;
  worldSeed = nextSeed;
  world = buildArchipelago({ seed: nextSeed, count: 64, radius: 11000, minGap: 390 });
  return world;
}

function consumeState(state) {
  if (!state || typeof state !== "object") return;
  currentState = state;
  if (state.currentRegion?.id) {
    addExplorationEvent({ kind: "region-entered", regionId: state.currentRegion.id });
  }
  if (state.latestDiscovery?.landmark?.id) {
    addExplorationEvent({
      kind: "landmark-reached",
      landmarkId: state.latestDiscovery.landmark.id,
      regionId: state.latestDiscovery.regionId || state.currentRegion?.id || null,
    });
  }
  latestFamiliarity = evaluateLocalFamiliarity({
    world: ensureWorld(state.seed),
    position: state.position,
    currentRegionId: state.currentRegion?.id || null,
    discoveredIslandIds: state.discovered,
    discoveredRouteIds: state.discoveredRoutes,
    exploration: { events: explorationEvents },
  });
}

function decorate(state) {
  if (!state || typeof state !== "object") return state;
  const fog = state.fog && typeof state.fog === "object" ? state.fog : {};
  const effectiveDensity = Number.isFinite(fog.effectiveDensity) ? fog.effectiveDensity : null;
  const renderedMultiplier = latestFamiliarity.densityMultiplier * arrivalMistMultiplier;
  return {
    ...state,
    fog: {
      ...fog,
      familiarity: latestFamiliarity.familiarity,
      familiarityDensityMultiplier: latestFamiliarity.densityMultiplier,
      familiarityNearContrast: latestFamiliarity.nearContrast,
      familiaritySourceCount: latestFamiliarity.sourceCount,
      familiarityStrongestSource: latestFamiliarity.strongestSource,
      familiarityRadius: latestFamiliarity.radius,
      expeditionArrivalClass: arrivalMistClass,
      expeditionArrivalDensityMultiplier: arrivalMistMultiplier,
      renderedDensity: effectiveDensity === null ? null : effectiveDensity * renderedMultiplier,
    },
  };
}

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "__greyblueState");
const priorGet = typeof priorDescriptor?.get === "function" ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === "function" ? priorDescriptor.set.bind(globalThis) : null;
let priorValue = priorGet ? priorGet() : globalThis.__greyblueState ?? null;

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, "__greyblueState", {
    configurable: true,
    enumerable: true,
    get() {
      const value = priorGet ? priorGet() : priorValue;
      return decorate(value);
    },
    set(value) {
      if (priorSet) priorSet(value);
      priorValue = priorGet ? priorGet() : value;
      consumeState(priorValue);
    },
  });
}
consumeState(priorValue);

function consumeEvent(kind, detail = {}) {
  const event = { kind };
  if (detail.landmarkId) event.landmarkId = detail.landmarkId;
  if (detail.routeId) event.routeId = detail.routeId;
  if (detail.corridorId) event.corridorId = detail.corridorId;
  if (detail.islandId) event.islandId = detail.islandId;
  if (detail.regionId) event.regionId = detail.regionId;
  addExplorationEvent(event);
  if (currentState) consumeState(currentState);
}

function arrivalMistProfile(consequenceClass) {
  const table = Object.freeze({ resonance: 0.92, clearing: 0.88, warmth: 0.94, hush: 0.97 });
  return table[consequenceClass] ?? null;
}

function onExpeditionArrival(event) {
  const consequenceClass = typeof event?.detail?.consequenceClass === "string" ? event.detail.consequenceClass : "";
  const multiplier = arrivalMistProfile(consequenceClass);
  if (!multiplier) return;
  if (arrivalMistTimer) clearTimeout(arrivalMistTimer);
  arrivalMistClass = consequenceClass;
  arrivalMistMultiplier = multiplier;
  const reducedMotion = (() => { try { return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches); } catch { return false; } })();
  arrivalMistTimer = setTimeout(() => {
    arrivalMistTimer = 0;
    arrivalMistClass = null;
    arrivalMistMultiplier = 1;
  }, reducedMotion ? 1800 : 3200);
}

const onLandmarkInvestigated = (event) => consumeEvent("landmark-investigated", event?.detail);
const onRouteCompleted = (event) => consumeEvent("route-completed", event?.detail);
const onApproachMastered = (event) => consumeEvent("approach-mastered", event?.detail);
globalThis.addEventListener?.("greyblue:landmark-investigated", onLandmarkInvestigated);
globalThis.addEventListener?.("greyblue:route-completed", onRouteCompleted);
globalThis.addEventListener?.("greyblue:approach-mastered", onApproachMastered);
globalThis.addEventListener?.("greyblue:expedition-arrival", onExpeditionArrival);

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithFamiliarMist(scene, camera) {
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density)) {
    return originalRender.call(this, scene, camera);
  }
  const authoredDensity = fog.density;
  fog.density = authoredDensity * latestFamiliarity.densityMultiplier * arrivalMistMultiplier;
  try {
    return originalRender.call(this, scene, camera);
  } finally {
    fog.density = authoredDensity;
  }
};

globalThis.addEventListener?.("beforeunload", () => {
  if (arrivalMistTimer) clearTimeout(arrivalMistTimer);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) {
    THREE.WebGLRenderer.prototype.render = originalRender;
  }
  globalThis.removeEventListener?.("greyblue:landmark-investigated", onLandmarkInvestigated);
  globalThis.removeEventListener?.("greyblue:route-completed", onRouteCompleted);
  globalThis.removeEventListener?.("greyblue:approach-mastered", onApproachMastered);
  globalThis.removeEventListener?.("greyblue:expedition-arrival", onExpeditionArrival);
}, { once: true });
