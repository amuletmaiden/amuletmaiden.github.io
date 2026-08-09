import { buildArchipelago } from '../world/archipelago.js';
import {
  deriveKnownCrossingDestinationAtmosphere,
  knownCrossingDestinationAtmospherePublicState,
} from './known-crossing-destination-atmosphere.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let currentAtmosphere = Object.freeze({ active: false, atmosphereClass: null, stage: null });
let lastKey = '';
let disposed = false;

const LINES = Object.freeze({
  hush: 'The air ahead quiets into the destination weather.',
  stone: 'A heavier mineral damp gathers ahead.',
  glass: 'Cold lucency begins to travel through the mist ahead.',
  current: 'The destination current begins to comb the mist into long bands.',
  warmth: 'A faint amber warmth gathers in the air ahead.',
  chorus: 'The distant air begins to answer in wider intervals.',
});

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function derive(state = currentState) {
  if (!state || typeof state !== 'object') return knownCrossingDestinationAtmospherePublicState(null);
  const guidance = state.routeGuidance ?? null;
  const familiarCrossing = globalThis.__greyblueFamiliarCrossing ?? state.familiarCrossing ?? null;
  return knownCrossingDestinationAtmospherePublicState(deriveKnownCrossingDestinationAtmosphere({
    world: getWorld(state),
    activeRouteId: guidance?.routeId ?? state.guidancePreference,
    destinationIslandId: guidance?.destinationIslandId ?? guidance?.destinationId,
    discoveredRouteIds: state.discoveredRoutes,
    discoveredIslandIds: state.discovered,
    familiarCrossing,
    crossingProgress: guidance?.progress,
    recoveryActive: Boolean(state.collision?.requiresRecovery),
  }));
}

function publish(next) {
  currentAtmosphere = next;
  globalThis.__greyblueKnownCrossingDestinationAtmosphere = next;
  const key = JSON.stringify(next);
  if (key === lastKey) return;
  lastKey = key;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-crossing-destination-atmosphere', {
    detail: Object.freeze({
      ...next,
      line: next.active ? LINES[next.atmosphereClass] ?? null : null,
      soundHook: next.active ? `destination-${next.atmosphereClass}` : null,
    }),
  }));
}

function recompute(state = currentState) {
  if (disposed) return currentAtmosphere;
  const next = derive(state);
  publish(next);
  return next;
}

function decorate(state) {
  if (!state || typeof state !== 'object') return state;
  return { ...state, knownCrossingDestinationAtmosphere: currentAtmosphere };
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return decorate(priorGet ? priorGet() : currentState); },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      recompute(currentState);
    },
  });
}

globalThis.addEventListener?.('greyblue:familiar-crossing-signature', () => queueMicrotask(() => recompute(currentState)));
globalThis.addEventListener?.('greyblue:route-completed', () => queueMicrotask(() => recompute(currentState)));
globalThis.addEventListener?.('greyblue:crossing-cancelled', () => queueMicrotask(() => recompute(currentState)));
recompute(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  delete globalThis.__greyblueKnownCrossingDestinationAtmosphere;
}, { once: true });
