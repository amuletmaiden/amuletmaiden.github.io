import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  createCloudbreakRunState,
  advanceCloudbreakRun,
  cloudbreakRunPublicState,
} from './cloudbreak-run.js';

let modelState = createCloudbreakRunState();
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
    regionId: region?.id ?? null,
    thinningHeight: region?.fogProfile?.altitudeThinning,
    position: Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z)
      ? Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) })
      : null,
    planarSpeed: state?.flight?.speed,
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-cloudbreak-run]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-cloudbreak-run', '');
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
  }, 7800);
}

function showListening(title, line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'cloudbreak-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = title;
  if (statusTarget) statusTarget.textContent = line;
}

function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.94;
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 850 : 1900);
}

function publishCompletion(publicState) {
  if (!publicState.completed || completionPublished) return;
  completionPublished = true;
  const line = 'The dragon drops back through the cloudline with the clear air still carrying behind it.';
  showListening('A cloudbreak closes cleanly.', line);
  showJournal(line);
  completionAtmosphere();
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:cloudbreak-run', {
    detail: Object.freeze({ ...publicState, event: 'completed' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'cloudbreak-run' }),
  }));
}

function step() {
  const frame = buildFrame(currentState());
  modelState = advanceCloudbreakRun(modelState, frame);
  const publicState = cloudbreakRunPublicState(modelState);
  globalThis.__greyblueCloudbreakRun = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueCloudbreakRun = Object.freeze({
  available: false,
  active: false,
  phase: 'climb',
  completed: false,
});

const originalRender = THREE.WebGLRenderer.prototype.render;
const cloudbreakRender = function renderWithCloudbreakRun(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = cloudbreakRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === cloudbreakRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueCloudbreakRun;
}, { once: true });
