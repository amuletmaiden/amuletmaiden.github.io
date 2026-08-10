import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { completedDiscoveredIslandSurveyInternalIdentity } from './discovered-island-survey-bootstrap.js';
import {
  advanceSurveyToLandingSortie,
  createSurveyToLandingSortieState,
  surveyToLandingSortiePublicState,
} from './survey-to-landing-sortie.js';

let sortieState = createSurveyToLandingSortieState();
let surveyArmConsumed = false;
let feedbackConsumed = false;
let world = null;
let worldSeed = null;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function finitePosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y ?? 0) && Number.isFinite(position.z);
}

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function discoveredSet(values) {
  if (values instanceof Set) return new Set(values);
  return new Set(Array.isArray(values) ? values : []);
}

function surveyedIsland(state) {
  const id = cleanId(completedDiscoveredIslandSurveyInternalIdentity());
  const regionId = cleanId(state?.currentRegion?.id);
  if (!id || !regionId) return null;
  const discovered = discoveredSet(state?.discovered);
  if (!discovered.has(id)) return null;
  return getWorld(state).islands.find((island) => island.id === id && island.regionId === regionId) ?? null;
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function airborne(state) {
  if (state?.collision?.grounded === true) return false;
  return state?.flight?.airborne !== false;
}

function liveInputs(state, island, { touchdown = false } = {}) {
  return {
    surveyCompleted: surveyArmConsumed !== true && Boolean(island),
    surveyIsland: island,
    discoveredIslandIds: state?.discovered,
    currentRegionId: cleanId(state?.currentRegion?.id),
    position: state?.position,
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: airborne(state),
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
    precisionTouchdownCompleted: touchdown,
    touchdownIslandId: touchdown && island ? island.id : '',
    landedPosition: touchdown ? state?.position : null,
  };
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-survey-sortie]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-survey-sortie', '');
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
  }, reducedMotion() ? 3000 : 7600);
}

function showListening(line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'survey-sortie';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The circuit closes on stone.';
  if (statusTarget) statusTarget.textContent = line;
}

function beginFeedback() {
  if (feedbackConsumed) return;
  feedbackConsumed = true;
  const line = 'You carry the island out into open air, return by its remembered shape, and settle where the rock will take you.';
  showJournal(line);
  showListening(line);

  mistMultiplier = 0.945;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 700 : 1900);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:survey-to-landing-sortie', {
    detail: Object.freeze({ completed: true, phase: 'settle' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'survey-to-landing-sortie' }),
  }));
}

function publish(previous) {
  const publicState = surveyToLandingSortiePublicState(sortieState);
  globalThis.__greyblueSurveyToLandingSortie = publicState;
  if (previous?.completed !== true && publicState.completed === true) beginFeedback();
}

function consumeState(state, options = {}) {
  if (sortieState.completed === true) {
    publish(sortieState);
    return;
  }

  const island = surveyedIsland(state);
  const before = sortieState;
  sortieState = advanceSurveyToLandingSortie(sortieState, liveInputs(state, island, options));
  if (before.active !== true && sortieState.active === true) surveyArmConsumed = true;
  publish(before);
}

function finishFromPrecisionTouchdown(event) {
  if (event?.detail?.completed !== true || sortieState.active !== true) return;
  consumeState(globalThis.__greyblueState, { touchdown: true });
}

globalThis.__greyblueSurveyToLandingSortie = surveyToLandingSortiePublicState(sortieState);
globalThis.addEventListener?.('greyblue:precision-touchdown', finishFromPrecisionTouchdown);

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
const sortieRender = function renderWithSurveySortieAtmosphere(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = sortieRender;

globalThis.addEventListener?.('beforeunload', () => {
  globalThis.removeEventListener?.('greyblue:precision-touchdown', finishFromPrecisionTouchdown);
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === sortieRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueSurveyToLandingSortie;
}, { once: true });
