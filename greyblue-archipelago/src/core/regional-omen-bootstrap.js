import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { evaluateRegionalOmenChain } from './regional-omen-chain.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let disposed = false;
let lastSignature = '';
const exploration = { events: Array.isArray(loadGame()?.exploration?.events) ? [...loadGame().exploration.events] : [] };

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || seed !== worldSeed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function evaluate(state = currentState) {
  const result = evaluateRegionalOmenChain({
    world: getWorld(state),
    exploration,
    currentRegionId: state?.currentRegion?.id ?? null,
    discoveredIslandIds: Array.isArray(state?.discovered) ? state.discovered : [],
  });
  const publicState = Object.freeze({
    active: result.active,
    regionId: result.regionId,
    tone: result.tone ? Object.freeze({ id: result.tone.id, text: result.tone.text, soundHook: result.tone.soundHook }) : null,
  });
  globalThis.__greyblueRegionalOmen = publicState;
  const signature = publicState.active ? `${publicState.regionId}:${publicState.tone?.id}` : '';
  if (signature !== lastSignature) {
    lastSignature = signature;
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-omen', { detail: publicState }));
  }
  return publicState;
}

function onLandmarkInvestigated(event) {
  const landmarkId = typeof event?.detail?.landmarkId === 'string' ? event.detail.landmarkId.trim().slice(0, 120) : '';
  const regionId = typeof event?.detail?.regionId === 'string' ? event.detail.regionId.trim().slice(0, 120) : '';
  if (!landmarkId) return;
  const duplicate = exploration.events.some((entry) => entry?.kind === 'landmark-investigated' && entry.landmarkId === landmarkId);
  if (!duplicate) exploration.events.push({ kind: 'landmark-investigated', landmarkId, regionId });
  evaluate();
}

globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      evaluate(currentState);
    },
  });
}

evaluate(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  if (disposed) delete globalThis.__greyblueRegionalOmen;
}, { once: true });