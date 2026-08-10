import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  advanceDiscoveredIslandSurvey,
  createDiscoveredIslandSurveyState,
  discoveredIslandSurveyPublicState,
} from './discovered-island-survey.js';

let surveyState = createDiscoveredIslandSurveyState();
let world = null;
let worldSeed = null;
let feedbackConsumed = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

export function completedDiscoveredIslandSurveyInternalIdentity() {
  return surveyState?.completed === true ? cleanId(surveyState.islandId) : '';
}

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
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

function liveInputs(state) {
  return {
    discoveredIslandIds: state?.discovered,
    currentRegionId: cleanId(state?.currentRegion?.id),
    position: state?.position,
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
  };
}

function candidateIslands(state) {
  const generated = getWorld(state);
  const regionId = cleanId(state?.currentRegion?.id);
  const discovered = new Set(Array.isArray(state?.discovered) ? state.discovered : state?.discovered instanceof Set ? state.discovered : []);
  const position = state?.position;
  if (!regionId || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return [];

  const currentId = cleanId(surveyState?.islandId);
  if (surveyState?.active === true && currentId) {
    const current = generated.islands.find((island) => island.id === currentId && island.regionId === regionId && discovered.has(island.id));
    return current ? [current] : [];
  }

  return generated.islands
    .filter((island) => island.regionId === regionId && discovered.has(island.id))
    .map((island) => ({ island, distance: Math.hypot(position.x - island.x, position.z - island.z) }))
    .sort((a, b) => a.distance - b.distance || a.island.id.localeCompare(b.island.id))
    .map(({ island }) => island);
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-island-survey]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-island-survey', '');
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
  listening.dataset.kind = 'island-survey';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = 'The island has a shape in the air.';
  if (statusTarget) statusTarget.textContent = line;
}

function beginSurveyFeedback() {
  if (feedbackConsumed) return;
  feedbackConsumed = true;
  const line = 'A full circuit gathers the island into one remembered shape: cliff, lee, shelf, and open water.';
  showJournal(line);
  showListening(line);

  mistMultiplier = 0.95;
  if (mistTimer) clearTimeout(mistTimer);
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 650 : 1700);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:discovered-island-survey', {
    detail: Object.freeze({ completed: true, phase: 'complete' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'discovered-island-survey' }),
  }));
}

function consumeState(state) {
  if (surveyState.completed === true) {
    globalThis.__greyblueDiscoveredIslandSurvey = discoveredIslandSurveyPublicState(surveyState);
    return;
  }

  const inputs = liveInputs(state);
  const candidates = candidateIslands(state);
  const beforeCompleted = surveyState.completed === true;

  if (surveyState.active === true) {
    surveyState = advanceDiscoveredIslandSurvey(surveyState, { ...inputs, island: candidates[0] });
  } else {
    let next = createDiscoveredIslandSurveyState();
    for (const island of candidates) {
      const attempt = advanceDiscoveredIslandSurvey(createDiscoveredIslandSurveyState(), { ...inputs, island });
      if (attempt.active === true || attempt.completed === true) {
        next = attempt;
        break;
      }
    }
    surveyState = next;
  }

  const publicState = discoveredIslandSurveyPublicState(surveyState);
  globalThis.__greyblueDiscoveredIslandSurvey = publicState;
  if (!beforeCompleted && publicState.completed === true) beginSurveyFeedback();
}

globalThis.__greyblueDiscoveredIslandSurvey = discoveredIslandSurveyPublicState(surveyState);

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
const surveyRender = function renderWithSurveyAtmosphere(scene, camera) {
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
THREE.WebGLRenderer.prototype.render = surveyRender;

globalThis.addEventListener?.('beforeunload', () => {
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === surveyRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueDiscoveredIslandSurvey;
}, { once: true });
