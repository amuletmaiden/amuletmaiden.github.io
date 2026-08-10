import * as THREE from 'three';
import {
  armTouchAndGoLaunch,
  createTouchAndGoLaunchState,
  stepTouchAndGoLaunch,
  touchAndGoLaunchPublicState,
} from './touch-and-go-launch.js';
import {
  clearTouchAndGoFeedback,
  consumeTouchAndGoCompletion,
  createTouchAndGoFeedbackState,
  touchAndGoFeedbackPublicState,
} from './touch-and-go-launch-feedback.js';

let launchState = createTouchAndGoLaunchState();
let feedbackState = createTouchAndGoFeedbackState();
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

function buildFrame(state) {
  const position = state?.position;
  const verticalSpeed = Number.isFinite(state?.flight?.verticalSpeed)
    ? Number(state.flight.verticalSpeed)
    : Number.isFinite(state?.flight?.velocity?.y)
      ? Number(state.flight.velocity.y)
      : Number.isFinite(state?.velocity?.y)
        ? Number(state.velocity.y)
        : null;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne === true,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
    position,
    speed: state?.flight?.speed,
    verticalSpeed,
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-touch-and-go]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-touch-and-go', '');
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
  }, 6800);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'touch-and-go-launch';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The landing keeps moving.';
  if (statusTarget) statusTarget.textContent = line;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function beginFeedback() {
  const line = 'Claws leave the shelf and the same clean landing opens back into flight.';
  showListening(line);
  showJournal(line);
  mistMultiplier = 0.965;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 700 : 1600);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:touch-and-go-launch', {
    detail: Object.freeze({ completed: true, phase: 'climb' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'touch-and-go-launch' }),
  }));

  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackTimer = 0;
    feedbackState = clearTouchAndGoFeedback(feedbackState);
    globalThis.__greyblueTouchAndGoFeedback = touchAndGoFeedbackPublicState(feedbackState);
  }, reducedMotion() ? 900 : 2200);
}

function publishCompletion(publicState) {
  if (publicState.completed !== true) return;
  const before = feedbackState;
  feedbackState = consumeTouchAndGoCompletion(feedbackState, publicState);
  globalThis.__greyblueTouchAndGoFeedback = touchAndGoFeedbackPublicState(feedbackState);
  if (feedbackState !== before && feedbackState.active === true) beginFeedback();
}

function consumeState(state) {
  if (launchState.armed !== true && launchState.completed !== true) {
    globalThis.__greyblueTouchAndGoLaunch = touchAndGoLaunchPublicState(launchState);
    return;
  }
  launchState = stepTouchAndGoLaunch({ state: launchState, frame: buildFrame(state) });
  const publicState = touchAndGoLaunchPublicState(launchState);
  globalThis.__greyblueTouchAndGoLaunch = publicState;
  publishCompletion(publicState);
}

function armFromTouchdown(event) {
  const before = launchState;
  launchState = armTouchAndGoLaunch(launchState, event?.detail);
  if (launchState !== before) globalThis.__greyblueTouchAndGoLaunch = touchAndGoLaunchPublicState(launchState);
}

globalThis.__greyblueTouchAndGoLaunch = touchAndGoLaunchPublicState(launchState);
globalThis.__greyblueTouchAndGoFeedback = touchAndGoFeedbackPublicState(feedbackState);
globalThis.addEventListener?.('greyblue:precision-touchdown', armFromTouchdown);

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
const touchAndGoRender = function renderWithTouchAndGoAtmosphere(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = touchAndGoRender;

globalThis.addEventListener?.('beforeunload', () => {
  globalThis.removeEventListener?.('greyblue:precision-touchdown', armFromTouchdown);
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === touchAndGoRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueTouchAndGoLaunch;
  delete globalThis.__greyblueTouchAndGoFeedback;
}, { once: true });
