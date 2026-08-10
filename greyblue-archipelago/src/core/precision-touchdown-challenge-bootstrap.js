import { buildArchipelago } from '../world/archipelago.js';
import { deriveDiscoveredLandingShelfCues } from './discovered-landing-shelf-cues.js';
import {
  createPrecisionTouchdownState,
  precisionTouchdownPublicState,
  stepPrecisionTouchdown,
} from './precision-touchdown-challenge.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let modelState = createPrecisionTouchdownState();
let world = null;
let worldSeed = null;
let priorAirborneTelemetry = null;
let completionPublished = false;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function finalApproachCue(state) {
  if (state?.flight?.airborne === false || state?.collision?.grounded === true) return null;
  const result = deriveDiscoveredLandingShelfCues({
    world: getWorld(state),
    currentRegionId: cleanId(state?.currentRegion?.id),
    discoveredIslandIds: state?.discovered,
    position: state?.position,
    grounded: false,
    recoveryActive: state?.collision?.requiresRecovery === true,
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
  });
  const cue = result?.cues?.[0];
  return cue?.approachClass === 'final' ? cue : null;
}

function expectedTouchdownShelfId(state) {
  const shelfId = cleanId(modelState?.shelfId);
  const position = state?.position;
  if (!shelfId || !Number.isFinite(position?.x) || !Number.isFinite(position?.y) || !Number.isFinite(position?.z)) return '';

  const discovered = new Set(Array.isArray(state?.discovered) ? state.discovered.map(cleanId).filter(Boolean) : []);
  const regionId = cleanId(state?.currentRegion?.id);
  for (const island of getWorld(state).islands ?? []) {
    if (!discovered.has(cleanId(island?.id)) || cleanId(island?.regionId) !== regionId) continue;
    for (const zone of island?.landingZones ?? []) {
      if (cleanId(zone?.id) !== shelfId) continue;
      const radius = Number(zone?.radius);
      const x = Number(zone?.x);
      const y = Number(zone?.y);
      const z = Number(zone?.z);
      if (![radius, x, y, z].every(Number.isFinite) || radius <= 0) return '';
      const horizontal = Math.hypot(position.x - x, position.z - z);
      const vertical = Math.abs(position.y - y);
      return horizontal <= radius && vertical <= 40 ? shelfId : '';
    }
  }
  return '';
}

function airborneTelemetry(state) {
  const speed = Number(state?.flight?.speed);
  const verticalVelocity = Number(state?.flight?.velocity?.y);
  if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(verticalVelocity)) return null;
  return Object.freeze({ speed, descentSpeed: Math.max(0, -verticalVelocity) });
}

function publishCompletion() {
  if (completionPublished || modelState.completed !== true) return;
  completionPublished = true;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:precision-touchdown', {
    detail: Object.freeze({ completed: true, soundHook: 'precision-touchdown' }),
  }));
}

function consume(state) {
  const grounded = state?.flight?.airborne === false;
  const cue = grounded ? null : finalApproachCue(state);
  const liveTelemetry = grounded ? priorAirborneTelemetry : airborneTelemetry(state);
  const input = {
    approachShelfId: cue?.zoneId ?? '',
    approachClass: cue?.approachClass ?? null,
    touchdownShelfId: grounded ? expectedTouchdownShelfId(state) : '',
    grounded,
    speed: liveTelemetry?.speed,
    descentSpeed: liveTelemetry?.descentSpeed,
    recoveryActive: state?.collision?.requiresRecovery === true,
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
  };

  modelState = stepPrecisionTouchdown(modelState, input);
  globalThis.__greybluePrecisionTouchdown = precisionTouchdownPublicState(modelState, input);
  publishCompletion();

  if (!grounded) priorAirborneTelemetry = airborneTelemetry(state);
  else priorAirborneTelemetry = null;
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      consume(currentState);
    },
  });
}

globalThis.__greybluePrecisionTouchdown = Object.freeze({ available: false, active: false, phase: null, completed: false });
consume(currentState);
