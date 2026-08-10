import * as THREE from 'three';
import {
  createLinkedBankReversalState,
  stepLinkedBankReversal,
  linkedBankReversalPublicState,
} from './linked-bank-reversal-mastery.js';

let masteryState = createLinkedBankReversalState();
let completionPublished = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function buildFrame(state) {
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    speed: state?.flight?.speed,
    position: state?.position,
  });
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-linked-bank-reversal]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-linked-bank-reversal', '');
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

function showListening(title, line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'linked-bank-reversal-mastery';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = title;
  if (statusTarget) statusTarget.textContent = line;
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.94;
  let reduced = false;
  try { reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch {}
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reduced ? 800 : 1750);
}

function publishCompletion(publicState) {
  if (!publicState.completed || completionPublished) return;
  completionPublished = true;
  const line = publicState.direction === 'right-left'
    ? 'The right carve releases through level air into a clean left return.'
    : 'The left carve releases through level air into a clean right return.';
  showListening('A linked reversal.', line);
  showJournal(line);
  completionAtmosphere();
  const detail = Object.freeze({ ...publicState, event: 'completed', line, soundHook: 'omen-confluence' });
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:linked-bank-reversal-mastery', { detail }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'linked-bank-reversal-mastery' }),
  }));
}

function step() {
  const frame = buildFrame(currentState());
  const bankArc = globalThis.__greyblueBankMistArcs ?? Object.freeze({ active: false, turnClass: null });
  masteryState = stepLinkedBankReversal({ state: masteryState, frame, bankArc });
  const publicState = linkedBankReversalPublicState(masteryState, frame);
  globalThis.__greyblueLinkedBankReversalMastery = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueLinkedBankReversalMastery = Object.freeze({
  available: false,
  active: false,
  phase: null,
  completed: false,
  direction: null,
});

const originalRender = THREE.WebGLRenderer.prototype.render;
const masteryRender = function renderWithLinkedBankReversalMastery(scene, camera) {
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
  delete globalThis.__greyblueLinkedBankReversalMastery;
}, { once: true });
