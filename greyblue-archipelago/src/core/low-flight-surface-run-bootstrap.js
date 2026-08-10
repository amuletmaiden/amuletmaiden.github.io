import * as THREE from 'three';
import {
  createLowFlightSurfaceRunState,
  stepLowFlightSurfaceRun,
  lowFlightSurfaceRunPublicState,
} from './low-flight-surface-run.js';

let runState = createLowFlightSurfaceRunState();
let completedPublished = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function interrupted(state, wake) {
  return !state?.ready
    || state?.paused === true
    || state?.collision?.grounded === true
    || state?.flight?.airborne === false
    || state?.collision?.requiresRecovery === true
    || crossingActive(state)
    || Boolean(state?.restorePublishing || state?.explorationRestorePublishing)
    || wake?.active !== true;
}

function truthfulWakeState(state, wake) {
  const position = state?.position;
  if (wake?.active !== true || (wake.wakeClass !== 'water' && wake.wakeClass !== 'mist')) return null;
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y) || !Number.isFinite(position?.z)) return null;
  return Object.freeze({
    wakeClass: wake.wakeClass,
    samples: Object.freeze([Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) })]),
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-surface-run]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-surface-run', '');
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

function showListening(title, line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'low-flight-surface-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = title;
  if (statusTarget) statusTarget.textContent = line;
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.965;
  let reduced = false;
  try { reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch {}
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reduced ? 900 : 2100);
}

function completionLine(runClass) {
  return runClass === 'water'
    ? 'The sea holds the shape of the low pass for a moment, then lets it go.'
    : 'The mist closes behind the low pass, leaving one clean seam in the air.';
}

function publishCompletion(publicState) {
  if (!publicState.completed || completedPublished) return;
  completedPublished = true;
  const line = completionLine(publicState.runClass);
  showListening('A clean surface run.', line);
  showJournal(line);
  completionAtmosphere();
  const detail = Object.freeze({ ...publicState, event: 'completed', line, soundHook: 'omen-confluence' });
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:low-flight-surface-run', { detail }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'low-flight-surface-run' }),
  }));
}

function step() {
  const state = currentState();
  const wake = globalThis.__greyblueLowFlightWake ?? Object.freeze({ active: false, wakeClass: null });
  const wakeState = truthfulWakeState(state, wake);
  runState = stepLowFlightSurfaceRun({
    state: runState,
    wakeState,
    interrupted: interrupted(state, wake),
  });
  const publicState = lowFlightSurfaceRunPublicState(runState, wakeState);
  globalThis.__greyblueLowFlightSurfaceRun = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueLowFlightSurfaceRun = Object.freeze({
  available: false,
  active: false,
  phase: null,
  completed: false,
  runClass: null,
});

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithLowFlightSurfaceRun(scene, camera) {
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

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === renderWithLowFlightSurfaceRun) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueLowFlightSurfaceRun;
}, { once: true });
