import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  advanceRegionalMysterySearchFlight,
  createRegionalMysterySearchFlightState,
  eligibleRegionalMysterySearchFocuses,
  regionalMysterySearchFlightPublicState,
} from './regional-mystery-search-flight.js';

const restored = loadGame();
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(restored?.exploration);
const recognizedRegionIds = new Set(
  (Array.isArray(restored?.exploration?.events) ? restored.exploration.events : [])
    .filter((event) => event?.kind === 'regional-thread-recognized' && typeof event?.regionId === 'string')
    .map((event) => event.regionId.trim().slice(0, 120))
    .filter(Boolean),
);
let searchState = createRegionalMysterySearchFlightState();
let world = null;
let worldSeed = null;
let feedbackConsumed = false;
let mistMultiplier = 1;
let feedbackTimer = 0;
let journalTimer = 0;

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

// Sibling optional systems may consume the completed search focus only through
// this module-scoped import seam. The public global and completion event remain
// bounded and identity-free.
export function deriveRegionalMysterySearchArrivalInternal(state = globalThis.__greyblueState ?? null) {
  if (searchState?.completed !== true || searchState?.phase !== 'arrive') return null;
  const landmarkId = cleanId(searchState.focusLandmarkId);
  const islandId = cleanId(searchState.focusIslandId);
  const regionId = cleanId(state?.currentRegion?.id);
  if (!landmarkId || !islandId || !regionId) return null;
  const island = getWorld(state)?.islands?.find((candidate) => cleanId(candidate?.id) === islandId) ?? null;
  if (!island || cleanId(island.regionId) !== regionId || cleanId(island.landmarkRecord?.id) !== landmarkId) return null;
  const encounterRadius = Number(island.landmarkRecord?.encounter?.triggerRadius);
  const x = Number(island.x);
  const z = Number(island.z);
  const y = Number(island.height) + 48;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
    || !Number.isFinite(encounterRadius) || encounterRadius <= 0) return null;
  return Object.freeze({
    landmarkId,
    regionId,
    focusPosition: Object.freeze({ x, y, z }),
    encounterRadius,
  });
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function recognizedThreadClass(state, regionId) {
  if (!recognizedRegionIds.has(regionId)) return '';
  const live = globalThis.__greyblueRegionalMysteryThread;
  if (live?.recognized === true && typeof live.threadClass === 'string') return cleanId(live.threadClass);
  const events = Array.isArray(restored?.exploration?.events) ? restored.exploration.events : [];
  const persisted = events.find((event) => event?.kind === 'regional-thread-recognized' && cleanId(event?.regionId) === regionId);
  return cleanId(persisted?.threadClass) || 'threshold';
}

function showJournal(line) {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return;
  let node = journal.querySelector('[data-greyblue-journal-regional-search]');
  if (!node) {
    node = document.createElement('div');
    node.dataset.greyblueJournalRegionalSearch = '';
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(node);
    else journal.append(node);
  }
  node.hidden = false;
  node.textContent = line;
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    node.hidden = true;
    node.textContent = '';
  }, reducedMotion() ? 3000 : 7200);
}

function completeFeedback() {
  if (feedbackConsumed) return;
  feedbackConsumed = true;
  const line = 'The larger pattern touches ground here, but does not explain itself.';
  showJournal(line);
  mistMultiplier = 0.94;
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 650 : 1800);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-mystery-search-flight', {
    detail: Object.freeze({ completed: true, phase: 'arrive' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'regional-mystery-search-flight' }),
  }));
}

function consumeState(state) {
  if (searchState.completed === true) {
    globalThis.__greyblueRegionalMysterySearchFlight = regionalMysterySearchFlightPublicState(searchState);
    return;
  }
  const regionId = cleanId(state?.currentRegion?.id);
  const threadClass = recognizedThreadClass(state, regionId);
  const focuses = eligibleRegionalMysterySearchFocuses({
    world: getWorld(state),
    currentRegionId: regionId,
    discoveredIslandIds: state?.discovered,
    investigatedLandmarkIds,
    threadClass,
  });
  const beforeCompleted = searchState.completed === true;
  searchState = advanceRegionalMysterySearchFlight(searchState, {
    focuses,
    recognized: Boolean(regionId && recognizedRegionIds.has(regionId) && threadClass),
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    position: state?.position,
  });
  const publicState = regionalMysterySearchFlightPublicState(searchState);
  globalThis.__greyblueRegionalMysterySearchFlight = publicState;
  if (publicState.active) mistMultiplier = publicState.phase === 'approach' ? 1.045 : 1.018;
  else if (!publicState.completed && !feedbackTimer) mistMultiplier = 1;
  if (!beforeCompleted && publicState.completed) completeFeedback();
}

function onLandmarkInvestigated(event) {
  const landmarkId = cleanId(event?.detail?.landmarkId);
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
}

function onThreadRecognized(event) {
  const regionId = cleanId(event?.detail?.regionId);
  if (regionId) recognizedRegionIds.add(regionId);
}

globalThis.__greyblueRegionalMysterySearchFlight = regionalMysterySearchFlightPublicState(searchState);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
globalThis.addEventListener?.('greyblue:regional-thread-recognized', onThreadRecognized);
globalThis.addEventListener?.('greyblue:regional-mystery-thread', onThreadRecognized);

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      consumeState(currentState);
    },
  });
}
consumeState(currentState);

const originalRender = THREE.WebGLRenderer.prototype.render;
const searchRender = function renderWithRegionalMysterySearch(scene, camera) {
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || mistMultiplier === 1) return originalRender.call(this, scene, camera);
  const authoredDensity = fog.density;
  fog.density = authoredDensity * mistMultiplier;
  try { return originalRender.call(this, scene, camera); }
  finally { fog.density = authoredDensity; }
};
THREE.WebGLRenderer.prototype.render = searchRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (journalTimer) clearTimeout(journalTimer);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  globalThis.removeEventListener?.('greyblue:regional-thread-recognized', onThreadRecognized);
  globalThis.removeEventListener?.('greyblue:regional-mystery-thread', onThreadRecognized);
  if (THREE.WebGLRenderer.prototype.render === searchRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueRegionalMysterySearchFlight;
}, { once: true });
