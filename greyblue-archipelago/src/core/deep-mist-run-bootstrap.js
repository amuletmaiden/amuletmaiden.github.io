import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  advanceDeepMistRun,
  createDeepMistRunState,
  deepMistRunPublicState,
} from './deep-mist-run.js';

let modelState = createDeepMistRunState();
let completionPublished = false;
let world = null;
let worldSeed = null;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

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

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function currentRegion(state) {
  const regionId = cleanId(state?.currentRegion?.id);
  if (!regionId) return null;
  return getWorld(state)?.regions?.find?.((region) => region?.id === regionId) ?? null;
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function buildFrame(state) {
  const region = currentRegion(state);
  const position = state?.position;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    currentRegionId: region?.id ?? null,
    thinningHeight: region?.fogProfile?.altitudeThinning,
    position: Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z)
      ? Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) })
      : null,
    speed: state?.flight?.speed,
  });
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-deep-mist-run]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-deep-mist-run', '');
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
  }, reducedMotion() ? 3200 : 7600);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'deep-mist-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The lower mist gives the dragon back.';
  if (statusTarget) statusTarget.textContent = line;
}

function publishCompletion(publicState) {
  if (!publicState.completed || completionPublished) return;
  completionPublished = true;
  const line = 'A long low thread through the weather ends in a clean climb, with the island silhouettes returning one by one.';
  showJournal(line);
  showListening(line);
  mistMultiplier = 0.95;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 750 : 1850);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:deep-mist-run', {
    detail: Object.freeze({ ...publicState, event: 'completed' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'deep-mist-run' }),
  }));
}

function step() {
  modelState = advanceDeepMistRun(modelState, buildFrame(currentState()));
  const publicState = deepMistRunPublicState(modelState);
  globalThis.__greyblueDeepMistRun = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueDeepMistRun = deepMistRunPublicState(modelState);

const originalRender = THREE.WebGLRenderer.prototype.render;
const deepMistRender = function renderWithDeepMistRun(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = deepMistRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === deepMistRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueDeepMistRun;
}, { once: true });
