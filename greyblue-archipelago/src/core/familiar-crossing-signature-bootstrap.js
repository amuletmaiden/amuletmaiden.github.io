import {
  deriveFamiliarCrossingSignature,
  familiarCrossingPublicState,
} from './familiar-crossing-signature.js';
import { loadGame } from './save.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let currentSignature = Object.freeze({ active: false, familiar: false, signature: null });
let lastPublishedKey = '';
let disposed = false;

function reducedMotionPreferred() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function canonicalExploration() {
  const restored = loadGame();
  return restored?.exploration && typeof restored.exploration === 'object'
    ? restored.exploration
    : { events: [] };
}

function currentRouteId(state) {
  return typeof state?.guidancePreference === 'string' && state.guidancePreference
    ? state.guidancePreference
    : null;
}

function signatureLine(signature) {
  const table = Object.freeze({
    hush: 'This remembered crossing falls quiet around the wings.',
    pressure: 'The familiar air gathers close along this crossing.',
    resonance: 'A known crossing answers with a low resonance.',
    clearing: 'The remembered way opens a little through the mist.',
  });
  return table[signature] ?? null;
}

function derive(state = currentState) {
  if (!state || typeof state !== 'object') {
    return Object.freeze({ active: false, familiar: false, signature: null });
  }
  return familiarCrossingPublicState(deriveFamiliarCrossingSignature({
    currentRouteId: currentRouteId(state),
    currentRegionId: state.currentRegion?.id ?? null,
    discoveredRouteIds: state.discoveredRoutes,
    exploration: canonicalExploration(),
    crossingActive: state.routeChoice?.reason === 'active-crossing',
    recoveryActive: Boolean(state.collision?.requiresRecovery),
    reducedMotion: reducedMotionPreferred(),
  }));
}

function publish(next) {
  currentSignature = next;
  globalThis.__greyblueFamiliarCrossing = next;
  const key = JSON.stringify(next);
  if (key === lastPublishedKey) return;
  lastPublishedKey = key;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:familiar-crossing-signature', {
    detail: Object.freeze({ ...next, line: next.active ? signatureLine(next.signature) : null }),
  }));
}

function recompute(state = currentState) {
  if (disposed) return currentSignature;
  const next = derive(state);
  publish(next);
  return next;
}

function decorate(state) {
  if (!state || typeof state !== 'object') return state;
  return { ...state, familiarCrossing: currentSignature };
}

function onCanonicalRouteChange() {
  queueMicrotask(() => recompute(currentState));
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

globalThis.addEventListener?.('greyblue:route-completed', onCanonicalRouteChange);
globalThis.addEventListener?.('greyblue:crossing-cancelled', onCanonicalRouteChange);

recompute(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:route-completed', onCanonicalRouteChange);
  globalThis.removeEventListener?.('greyblue:crossing-cancelled', onCanonicalRouteChange);
  delete globalThis.__greyblueFamiliarCrossing;
}, { once: true });
