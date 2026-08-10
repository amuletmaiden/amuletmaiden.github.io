import * as THREE from 'three';
import {
  createDivePullClimbState,
  stepDivePullClimb,
  divePullClimbPublicState,
} from './dive-pull-climb-mastery.js';

let masteryState = createDivePullClimbState();
let completionPublished = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function buildFrame(state) {
  const altitude = Number.isFinite(state?.position?.y) ? Number(state.position.y) : null;
  const verticalSpeed = Number.isFinite(state?.flight?.verticalSpeed)
    ? Number(state.flight.verticalSpeed)
    : Number.isFinite(state?.velocity?.y)
      ? Number(state.velocity.y)
      : null;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    speed: state?.flight?.speed,
    altitude,
    verticalSpeed,
    airClass: globalThis.__greyblueAerodynamicSound?.active === true
      ? globalThis.__greyblueAerodynamicSound.airClass
      : null,
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-dive-pull-climb]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-dive-pull-climb', '');
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
  listening.dataset.kind = 'dive-pull-climb-mastery';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = title;
  if (statusTarget) statusTarget.textContent = line;
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.955;
  let reduced = false;
  try { reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch {}
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reduced ? 850 : 1900);
}

function publishCompletion(publicState) {
  if (!publicState.completed || completionPublished) return;
  completionPublished = true;
  const line = 'The dive folds cleanly into the climb; the mist opens along the recovered arc.';
  showListening('A clean recovery arc.', line);
  showJournal(line);
  completionAtmosphere();
  const detail = Object.freeze({ ...publicState, event: 'completed', line, soundHook: 'omen-confluence' });
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:dive-pull-climb-mastery', { detail }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'dive-pull-climb-mastery' }),
  }));
}

function step() {
  const frame = buildFrame(currentState());
  masteryState = stepDivePullClimb({ state: masteryState, frame });
  const publicState = divePullClimbPublicState(masteryState, frame);
  globalThis.__greyblueDivePullClimbMastery = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueDivePullClimbMastery = Object.freeze({
  available: false,
  active: false,
  phase: null,
  completed: false,
});

const originalRender = THREE.WebGLRenderer.prototype.render;
const masteryRender = function renderWithDivePullClimbMastery(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = masteryRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === masteryRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueDivePullClimbMastery;
}, { once: true });
