import * as THREE from 'three';
import {
  advanceMistThreadArrival,
  createMistThreadArrivalState,
  mistThreadArrivalPublicState,
} from './mist-thread-arrival.js';
import { deriveUndiscoveredIslandMistHintInternal } from './undiscovered-island-mist-hint-bootstrap.js';

let arrivalState = createMistThreadArrivalState();
let feedbackConsumed = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-mist-arrival]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-mist-arrival', '');
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
  }, reducedMotion() ? 2800 : 6800);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'mist-thread-arrival';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The mist has led somewhere.';
  if (statusTarget) statusTarget.textContent = line;
}

function beginArrivalFeedback() {
  if (feedbackConsumed) return;
  feedbackConsumed = true;
  const line = 'The pale thread thins against unfamiliar stone. The island was there before you named it.';
  showJournal(line);
  showListening(line);

  mistMultiplier = 0.94;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 650 : 1700);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:mist-thread-arrival', {
    detail: Object.freeze({ completed: true, phase: 'arrival' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'mist-thread-arrival' }),
  }));
}

function consumeState(state) {
  const hint = deriveUndiscoveredIslandMistHintInternal(state);
  const beforeCompleted = arrivalState.completed === true;
  arrivalState = advanceMistThreadArrival(arrivalState, {
    hint,
    discoveredIslandIds: state?.discovered,
    position: state?.position,
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
  });
  const publicState = mistThreadArrivalPublicState(arrivalState);
  globalThis.__greyblueMistThreadArrival = publicState;
  if (!beforeCompleted && publicState.completed === true) beginArrivalFeedback();
}

globalThis.__greyblueMistThreadArrival = mistThreadArrivalPublicState(arrivalState);

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
const mistArrivalRender = function renderWithMistArrivalAtmosphere(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = mistArrivalRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === mistArrivalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueMistThreadArrival;
}, { once: true });
