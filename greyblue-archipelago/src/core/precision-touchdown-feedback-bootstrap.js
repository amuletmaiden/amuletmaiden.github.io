import * as THREE from 'three';
import {
  clearPrecisionTouchdownFeedback,
  consumePrecisionTouchdownCompletion,
  createPrecisionTouchdownFeedbackState,
  precisionTouchdownFeedbackPublicState,
} from './precision-touchdown-feedback.js';

let feedbackState = createPrecisionTouchdownFeedbackState();
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;
let responseTimer = 0;

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-precision-touchdown]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-precision-touchdown', '');
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
  listening.dataset.kind = 'precision-touchdown';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The landing settles cleanly.';
  if (statusTarget) statusTarget.textContent = line;
}

function beginAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.965;
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 700 : 1650);
}

function clearResponseLater() {
  if (responseTimer) clearTimeout(responseTimer);
  responseTimer = setTimeout(() => {
    responseTimer = 0;
    feedbackState = clearPrecisionTouchdownFeedback(feedbackState);
    globalThis.__greybluePrecisionTouchdownFeedback = precisionTouchdownFeedbackPublicState(feedbackState);
  }, reducedMotion() ? 800 : 1800);
}

function onPrecisionTouchdown(event) {
  const next = consumePrecisionTouchdownCompletion(feedbackState, event?.detail);
  if (next === feedbackState) return;
  feedbackState = next;
  globalThis.__greybluePrecisionTouchdownFeedback = precisionTouchdownFeedbackPublicState(feedbackState);

  const line = 'Claw, weight, and wing come quiet together on the shelf.';
  showListening(line);
  showJournal(line);
  beginAtmosphere();
  clearResponseLater();

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'precision-touchdown' }),
  }));
}

globalThis.__greybluePrecisionTouchdownFeedback = precisionTouchdownFeedbackPublicState(feedbackState);
globalThis.addEventListener?.('greyblue:precision-touchdown', onPrecisionTouchdown);

const originalRender = THREE.WebGLRenderer.prototype.render;
const precisionTouchdownRender = function renderWithPrecisionTouchdownFeedback(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = precisionTouchdownRender;

globalThis.addEventListener?.('beforeunload', () => {
  globalThis.removeEventListener?.('greyblue:precision-touchdown', onPrecisionTouchdown);
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (responseTimer) clearTimeout(responseTimer);
  if (THREE.WebGLRenderer.prototype.render === precisionTouchdownRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greybluePrecisionTouchdownFeedback;
}, { once: true });
