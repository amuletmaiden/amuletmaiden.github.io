import * as THREE from 'three';
import {
  createIslandHopRunState,
  finishIslandHopRun,
  islandHopRunPublicState,
  startIslandHopRun,
  stepIslandHopRun,
} from './island-hop-run.js';
import {
  clearIslandHopFeedback,
  consumeIslandHopCompletion,
  createIslandHopFeedbackState,
  islandHopFeedbackPublicState,
} from './island-hop-run-feedback.js';

let runState = createIslandHopRunState();
let feedbackState = createIslandHopFeedbackState();
let feedbackTimer = 0;
let mistTimer = 0;
let mistMultiplier = 1;
let journalTimer = 0;

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function buildFrame(state) {
  const position = finitePosition(state?.position)
    ? Object.freeze({ x: state.position.x, y: state.position.y, z: state.position.z })
    : state?.position;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne === true,
    position,
  });
}

function currentPosition() {
  const state = globalThis.__greyblueState;
  return finitePosition(state?.position)
    ? Object.freeze({ x: state.position.x, y: state.position.y, z: state.position.z })
    : null;
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-island-hop]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-island-hop', '');
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
  }, 7200);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'island-hop-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'One landing carries into another.';
  if (statusTarget) statusTarget.textContent = line;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function beginFeedback() {
  const line = 'The long crossing settles cleanly: launch, open air, then claws on stone again.';
  showListening(line);
  showJournal(line);
  mistMultiplier = 0.955;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 700 : 1800);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:island-hop-run', {
    detail: Object.freeze({ completed: true, phase: 'arrive' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'island-hop-run' }),
  }));

  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackTimer = 0;
    feedbackState = clearIslandHopFeedback(feedbackState);
    globalThis.__greyblueIslandHopFeedback = islandHopFeedbackPublicState(feedbackState);
  }, reducedMotion() ? 900 : 2400);
}

function publishCompletion(publicState) {
  if (publicState.completed !== true) return;
  const before = feedbackState;
  feedbackState = consumeIslandHopCompletion(feedbackState, publicState);
  globalThis.__greyblueIslandHopFeedback = islandHopFeedbackPublicState(feedbackState);
  if (feedbackState !== before && feedbackState.active === true) beginFeedback();
}

function consumeState(state) {
  if (runState.armed !== true || runState.completed === true) {
    globalThis.__greyblueIslandHopRun = islandHopRunPublicState(runState);
    return;
  }
  runState = stepIslandHopRun({ state: runState, frame: buildFrame(state) });
  globalThis.__greyblueIslandHopRun = islandHopRunPublicState(runState);
}

function startFromTouchAndGo(event) {
  const before = runState;
  runState = startIslandHopRun(runState, event?.detail, currentPosition());
  if (runState !== before) globalThis.__greyblueIslandHopRun = islandHopRunPublicState(runState);
}

function finishFromTouchdown(event) {
  const before = runState;
  runState = finishIslandHopRun(runState, event?.detail);
  const publicState = islandHopRunPublicState(runState);
  globalThis.__greyblueIslandHopRun = publicState;
  if (runState !== before) publishCompletion(publicState);
}

globalThis.__greyblueIslandHopRun = islandHopRunPublicState(runState);
globalThis.__greyblueIslandHopFeedback = islandHopFeedbackPublicState(feedbackState);
globalThis.addEventListener?.('greyblue:touch-and-go-launch', startFromTouchAndGo);
globalThis.addEventListener?.('greyblue:precision-touchdown', finishFromTouchdown);

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
const islandHopRender = function renderWithIslandHopAtmosphere(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = islandHopRender;

globalThis.addEventListener?.('beforeunload', () => {
  globalThis.removeEventListener?.('greyblue:touch-and-go-launch', startFromTouchAndGo);
  globalThis.removeEventListener?.('greyblue:precision-touchdown', finishFromTouchdown);
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === islandHopRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueIslandHopRun;
  delete globalThis.__greyblueIslandHopFeedback;
}, { once: true });
