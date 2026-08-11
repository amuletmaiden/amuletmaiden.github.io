import * as THREE from 'three';
import {
  advanceFullColumnWeatherRun,
  createFullColumnWeatherRunState,
  fullColumnWeatherRunPublicState,
} from './full-column-weather-run.js';

let modelState = createFullColumnWeatherRunState();
let completionPublished = false;
let pendingDeepMistCompletion = false;
let pendingCloudbreakCompletion = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function buildFrame(state) {
  const position = state?.position;
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    currentRegionId: cleanId(state?.currentRegion?.id),
    position: Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z)
      ? Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) })
      : null,
    deepMistCompleted: pendingDeepMistCompletion,
    cloudbreakCompleted: pendingCloudbreakCompletion,
  });
}

function truthfulCompletion(event) {
  const detail = event?.detail;
  return detail?.event === 'completed'
    && detail?.completed === true
    && detail?.active === false;
}

function onDeepMistCompletion(event) {
  if (!truthfulCompletion(event) || completionPublished) return;
  pendingDeepMistCompletion = true;
}

function onCloudbreakCompletion(event) {
  if (!truthfulCompletion(event) || completionPublished) return;
  pendingCloudbreakCompletion = true;
}

globalThis.addEventListener?.('greyblue:deep-mist-run', onDeepMistCompletion);
globalThis.addEventListener?.('greyblue:cloudbreak-run', onCloudbreakCompletion);

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-full-column-weather-run]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-full-column-weather-run', '');
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
  }, reducedMotion() ? 3400 : 8200);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'full-column-weather-run';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The whole weather column opens.';
  if (statusTarget) statusTarget.textContent = line;
}

function publishCompletion(publicState) {
  if (!publicState.completed || completionPublished) return;
  completionPublished = true;
  const line = 'From the low grey water of the mist to the clean air above it, the climb resolves into one unbroken flight.';
  showJournal(line);
  showListening(line);
  mistMultiplier = 0.92;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 800 : 2100);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:full-column-weather-run', {
    detail: Object.freeze({ ...publicState, event: 'completed' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'full-column-weather-run' }),
  }));
}

function step() {
  const frame = buildFrame(currentState());
  pendingDeepMistCompletion = false;
  pendingCloudbreakCompletion = false;
  modelState = advanceFullColumnWeatherRun(modelState, frame);
  const publicState = fullColumnWeatherRunPublicState(modelState);
  globalThis.__greyblueFullColumnWeatherRun = publicState;
  publishCompletion(publicState);
}

globalThis.__greyblueFullColumnWeatherRun = fullColumnWeatherRunPublicState(modelState);

const originalRender = THREE.WebGLRenderer.prototype.render;
const fullColumnRender = function renderWithFullColumnWeatherRun(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = fullColumnRender;

globalThis.addEventListener?.('beforeunload', () => {
  globalThis.removeEventListener?.('greyblue:deep-mist-run', onDeepMistCompletion);
  globalThis.removeEventListener?.('greyblue:cloudbreak-run', onCloudbreakCompletion);
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === fullColumnRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueFullColumnWeatherRun;
}, { once: true });
