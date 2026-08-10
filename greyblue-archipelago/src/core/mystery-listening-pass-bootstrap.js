import * as THREE from 'three';
import {
  advanceMysteryListeningPass,
  armMysteryListeningPass,
  createMysteryListeningPassState,
  mysteryListeningPassPublicState,
} from './mystery-listening-pass.js';
import { deriveRegionalMysterySearchArrivalInternal } from './regional-mystery-search-flight-bootstrap.js';

let passState = createMysteryListeningPassState();
let feedbackConsumed = false;
let mistMultiplier = 1;
let feedbackTimer = 0;
let journalTimer = 0;
let listeningNode = null;
let journalNode = null;
let pendingListen = false;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function ensureNodes() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (journal && !journalNode?.isConnected) {
    journalNode = document.createElement('div');
    journalNode.dataset.greyblueJournalMysteryListeningPass = '';
    journalNode.hidden = true;
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(journalNode);
    else journal.append(journalNode);
  }
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (listening && !listeningNode?.isConnected) {
    listeningNode = document.createElement('div');
    listeningNode.dataset.greyblueListeningMysteryPass = '';
    listeningNode.hidden = true;
    listening.append(listeningNode);
  }
}

function clearFeedback() {
  if (journalNode) {
    journalNode.hidden = true;
    journalNode.textContent = '';
  }
  if (listeningNode) {
    listeningNode.hidden = true;
    listeningNode.textContent = '';
  }
}

function completeFeedback() {
  if (feedbackConsumed) return;
  feedbackConsumed = true;
  ensureNodes();
  const line = 'On the return pass, the known place answers differently.';
  if (journalNode) {
    journalNode.hidden = false;
    journalNode.textContent = line;
  }
  if (listeningNode) {
    listeningNode.hidden = false;
    listeningNode.textContent = line;
  }
  mistMultiplier = 0.93;
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 650 : 1800);
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    clearFeedback();
  }, reducedMotion() ? 3000 : 7200);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:mystery-listening-pass', {
    detail: Object.freeze({ completed: true, phase: 'listen' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'mystery-listening-pass' }),
  }));
}

function armFromArrival() {
  if (passState.completed === true || passState.active === true) return;
  const arrival = deriveRegionalMysterySearchArrivalInternal(globalThis.__greyblueState ?? null);
  if (!arrival) return;
  passState = armMysteryListeningPass(passState, {
    completedArrival: true,
    landmarkId: arrival.landmarkId,
    regionId: arrival.regionId,
    focusPosition: arrival.focusPosition,
    encounterRadius: arrival.encounterRadius,
  });
  globalThis.__greyblueMysteryListeningPass = mysteryListeningPassPublicState(passState);
}

function consumeState(state) {
  if (passState.completed === true) {
    globalThis.__greyblueMysteryListeningPass = mysteryListeningPassPublicState(passState);
    pendingListen = false;
    return;
  }
  if (passState.active !== true) armFromArrival();
  const arrival = deriveRegionalMysterySearchArrivalInternal(state);
  const beforeCompleted = passState.completed === true;
  passState = advanceMysteryListeningPass(passState, {
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    regionId: cleanId(state?.currentRegion?.id),
    landmarkId: arrival?.landmarkId,
    position: state?.position,
    listened: pendingListen,
  });
  pendingListen = false;
  const publicState = mysteryListeningPassPublicState(passState);
  globalThis.__greyblueMysteryListeningPass = publicState;
  if (!beforeCompleted && publicState.completed) completeFeedback();
}

function onSearchCompleted(event) {
  if (event?.detail?.completed !== true || event?.detail?.phase !== 'arrive') return;
  armFromArrival();
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'KeyQ') return;
  if (passState.active !== true || passState.phase !== 'listen') return;
  pendingListen = true;
  consumeState(globalThis.__greyblueState ?? null);
}

globalThis.__greyblueMysteryListeningPass = mysteryListeningPassPublicState(passState);
globalThis.addEventListener?.('greyblue:regional-mystery-search-flight', onSearchCompleted);
globalThis.addEventListener?.('keydown', onKeyDown);

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
const passRender = function renderWithMysteryListeningPass(scene, camera) {
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || mistMultiplier === 1) return originalRender.call(this, scene, camera);
  const authoredDensity = fog.density;
  fog.density = authoredDensity * mistMultiplier;
  try { return originalRender.call(this, scene, camera); }
  finally { fog.density = authoredDensity; }
};
THREE.WebGLRenderer.prototype.render = passRender;

ensureNodes();
globalThis.addEventListener?.('beforeunload', () => {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (journalTimer) clearTimeout(journalTimer);
  globalThis.removeEventListener?.('greyblue:regional-mystery-search-flight', onSearchCompleted);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  if (THREE.WebGLRenderer.prototype.render === passRender) THREE.WebGLRenderer.prototype.render = originalRender;
  clearFeedback();
  journalNode?.remove();
  listeningNode?.remove();
  delete globalThis.__greyblueMysteryListeningPass;
}, { once: true });
