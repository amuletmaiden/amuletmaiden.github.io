import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { completedHighAirCrossingInternalDestination } from './high-air-crossing-bootstrap.js';
import {
  advanceHighAirLandfall,
  createHighAirLandfallState,
  highAirLandfallPublicState,
} from './high-air-landfall.js';

let modelState = createHighAirLandfallState();
let world = null;
let worldSeed = null;
let crossingCompletionPending = false;
let touchdownCompletionPending = false;
let completionPublished = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function currentState() {
  return globalThis.__greyblueState ?? null;
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

function resolveFrame(state) {
  const generated = getWorld(state);
  const regionId = cleanId(state?.currentRegion?.id);
  const destinationId = completedHighAirCrossingInternalDestination();
  const region = generated?.regions?.find?.((item) => cleanId(item?.id) === regionId) ?? null;
  const anchorIslandId = cleanId(region?.anchorIslandId);
  const anchorIsland = generated?.islands?.find?.((island) => cleanId(island?.id) === anchorIslandId) ?? null;
  const position = state?.position;
  const finitePosition = Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z)
    ? Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) })
    : null;

  return Object.freeze({
    highAirCrossingCompleted: crossingCompletionPending && destinationId === regionId,
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
    currentRegionId: regionId,
    thinningHeight: region?.fogProfile?.altitudeThinning,
    anchorIsland,
    discoveredIslandIds: state?.discovered,
    position: finitePosition,
    precisionTouchdownCompleted: touchdownCompletionPending,
    landedPosition: touchdownCompletionPending ? finitePosition : null,
  });
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-high-air-landfall]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-high-air-landfall', '');
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(node);
    else journal.append(node);
  }
  return node;
}

function showJournal(line) {
  const node = journalNode();
  if (!node) return;
  node.hidden = false;
  node.textContent = line;
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    node.hidden = true;
    node.textContent = '';
  }, reducedMotion() ? 3000 : 7600);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'high-air-landfall';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The crossing becomes a landfall.';
  if (statusTarget) statusTarget.textContent = line;
}

function beginCompletionFeedback() {
  if (completionPublished) return;
  completionPublished = true;
  const line = 'Clear air gives way to island weather; the long descent finishes on a known shelf with the whole crossing behind it.';
  showJournal(line);
  showListening(line);
  mistMultiplier = 0.94;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 700 : 1800);
  const publicState = highAirLandfallPublicState(modelState);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:high-air-landfall', {
    detail: Object.freeze({ ...publicState, event: 'completed' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'high-air-landfall' }),
  }));
}

function step() {
  const beforeCompleted = modelState?.completed === true;
  modelState = advanceHighAirLandfall(modelState, resolveFrame(currentState()));
  crossingCompletionPending = false;
  touchdownCompletionPending = false;
  const publicState = highAirLandfallPublicState(modelState);
  globalThis.__greyblueHighAirLandfall = publicState;
  if (!beforeCompleted && publicState.completed === true) beginCompletionFeedback();
}

function onCrossingCompletion(event) {
  if (event?.detail?.completed !== true || event?.detail?.phase !== 'arrive') return;
  crossingCompletionPending = true;
  step();
}

function onPrecisionTouchdown(event) {
  if (event?.detail?.completed !== true) return;
  touchdownCompletionPending = true;
  step();
}

globalThis.addEventListener?.('greyblue:high-air-crossing', onCrossingCompletion);
globalThis.addEventListener?.('greyblue:precision-touchdown', onPrecisionTouchdown);
globalThis.__greyblueHighAirLandfall = highAirLandfallPublicState(modelState);

const originalRender = THREE.WebGLRenderer.prototype.render;
const landfallRender = function renderWithHighAirLandfall(scene, camera) {
  step();
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || mistMultiplier === 1) {
    return originalRender.call(this, scene, camera);
  }
  const authoredDensity = fog.density;
  fog.density = authoredDensity * mistMultiplier;
  try {
    return originalRender.call(this, scene, camera);
  } finally {
    fog.density = authoredDensity;
  }
};
THREE.WebGLRenderer.prototype.render = landfallRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  globalThis.removeEventListener?.('greyblue:high-air-crossing', onCrossingCompletion);
  globalThis.removeEventListener?.('greyblue:precision-touchdown', onPrecisionTouchdown);
  if (THREE.WebGLRenderer.prototype.render === landfallRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueHighAirLandfall;
}, { once: true });
