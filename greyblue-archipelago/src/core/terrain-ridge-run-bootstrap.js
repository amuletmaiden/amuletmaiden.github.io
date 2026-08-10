import * as THREE from 'three';
import {
  createTerrainRidgeRunState,
  stepTerrainRidgeRun,
  terrainRidgeRunPublicState,
} from './terrain-ridge-run.js';

let runState = createTerrainRidgeRunState();
let completedPublished = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function interrupted(state, skim) {
  return !state?.ready
    || state?.paused === true
    || state?.collision?.grounded === true
    || state?.flight?.airborne === false
    || state?.collision?.requiresRecovery === true
    || Boolean(state?.restorePublishing || state?.explorationRestorePublishing)
    || skim?.active !== true;
}

function frameFor(state, skim) {
  const position = state?.position;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.flight?.airborne !== false && state?.collision?.grounded !== true,
    recoveryActive: state?.collision?.requiresRecovery === true,
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    skim: Object.freeze({
      active: skim?.active === true,
      skimClass: ['near', 'close', 'razor'].includes(skim?.skimClass) ? skim.skimClass : null,
    }),
    position: Object.freeze({
      x: Number(position?.x),
      y: Number(position?.y),
      z: Number(position?.z),
    }),
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-ridge-run]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-ridge-run', '');
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) journal.insertBefore(node, omen);
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
  }, 7600);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'terrain-ridge-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'A ridge run holds.';
  if (statusTarget) statusTarget.textContent = line;
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.96;
  let reduced = false;
  try { reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch {}
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reduced ? 850 : 1900);
}

function publishCompletion(publicState) {
  if (!publicState.completed || completedPublished) return;
  completedPublished = true;
  const line = 'The ridge falls away behind you in one unbroken sweep.';
  showListening(line);
  showJournal(line);
  completionAtmosphere();
  const detail = Object.freeze({ ...publicState, event: 'completed', line, soundHook: 'omen-confluence' });
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:terrain-ridge-run', { detail }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'terrain-ridge-run' }),
  }));
}

function step() {
  const state = currentState();
  const skim = globalThis.__greyblueTerrainSkimPressure ?? Object.freeze({ active: false, skimClass: null });
  const frame = frameFor(state, skim);
  runState = stepTerrainRidgeRun({
    state: runState,
    frame: interrupted(state, skim)
      ? Object.freeze({ ...frame, ready: false })
      : frame,
  });
  const publicState = terrainRidgeRunPublicState(runState);
  globalThis.__greyblueTerrainRidgeRun = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueTerrainRidgeRun = Object.freeze({
  available: false,
  active: false,
  phase: null,
  completed: false,
});

const originalRender = THREE.WebGLRenderer.prototype.render;
const ridgeRunRender = function renderWithTerrainRidgeRun(scene, camera) {
  step();
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || mistMultiplier === 1) return originalRender.call(this, scene, camera);
  const authoredDensity = fog.density;
  fog.density = authoredDensity * mistMultiplier;
  try {
    return originalRender.call(this, scene, camera);
  } finally {
    fog.density = authoredDensity;
  }
};
THREE.WebGLRenderer.prototype.render = ridgeRunRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === ridgeRunRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueTerrainRidgeRun;
}, { once: true });
