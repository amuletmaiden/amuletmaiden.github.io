import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  knownLandmarkTraversalCircuitPublicState,
  stepKnownLandmarkTraversalCircuit,
} from './known-landmark-traversal-circuit.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let circuitState = null;
let disposed = false;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(loadGame()?.exploration);

const host = document.querySelector('#hud') ?? document.body;
const panel = document.createElement('section');
panel.id = 'greyblue-known-landmark-circuit';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Known landmark circuit');
panel.innerHTML = `
  <div data-greyblue-circuit-eyebrow>Known circuit</div>
  <strong data-greyblue-circuit-title></strong>
  <div data-greyblue-circuit-status></div>
  <button type="button" data-greyblue-circuit-start>Begin circuit</button>
`;
host.append(panel);

const titleNode = panel.querySelector('[data-greyblue-circuit-title]');
const statusNode = panel.querySelector('[data-greyblue-circuit-status]');
const startButton = panel.querySelector('[data-greyblue-circuit-start]');

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
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function activeKnownApproach(state) {
  const approach = state?.landmarkFlightApproach;
  if (!approach?.visible || approach?.alreadyInvestigated !== true) return null;
  const islandId = typeof approach.islandId === 'string' ? approach.islandId.trim().slice(0, 120) : '';
  const landmarkId = typeof approach.landmarkId === 'string' ? approach.landmarkId.trim().slice(0, 120) : '';
  if (!islandId || !landmarkId) return null;
  return { islandId, landmarkId };
}

function derive({ startRequested = false, interactionRequested = false } = {}) {
  const state = currentState;
  if (!state?.ready || state?.paused) return stepKnownLandmarkTraversalCircuit();
  const approach = activeKnownApproach(state);
  return stepKnownLandmarkTraversalCircuit({
    world: getWorld(state),
    currentRegionId: state?.currentRegion?.id,
    discoveredIslandIds: state?.discovered,
    investigatedLandmarkIds,
    startRequested,
    interactionRequested,
    encounterPresent: Boolean(approach),
    currentIslandId: approach?.islandId,
    currentLandmarkId: approach?.landmarkId,
    recoveryActive: Boolean(state?.collision?.requiresRecovery),
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    state: circuitState,
  });
}

function publicResult(result) {
  return knownLandmarkTraversalCircuitPublicState(result);
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-traversal-circuit]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-traversal-circuit', '');
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) journal.insertBefore(node, omen);
    else journal.append(node);
  }
  return node;
}

function showJournal(line, temporary = false) {
  const node = journalNode();
  if (!node) return;
  node.hidden = false;
  node.textContent = line;
  if (journalTimer) clearTimeout(journalTimer);
  if (!temporary) return;
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    node.hidden = true;
    node.textContent = '';
  }, 8500);
}

function showListening(title, line) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const titleTarget = listening.querySelector('[data-greyblue-listening-title]');
  const statusTarget = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = 'known-landmark-circuit';
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (titleTarget) titleTarget.textContent = title;
  if (statusTarget) statusTarget.textContent = line;
}

function completionAtmosphere() {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = 0.955;
  const reducedMotion = (() => {
    try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
  })();
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion ? 1100 : 2400);
}

function publish(result) {
  const publicState = publicResult(result);
  globalThis.__greyblueKnownLandmarkCircuit = publicState;
  panel.hidden = !publicState.available && !publicState.completed;
  startButton.hidden = publicState.active || publicState.completed;
  startButton.disabled = !publicState.available || publicState.active;

  if (publicState.completed) {
    titleNode.textContent = 'Circuit complete.';
    statusNode.textContent = 'Three known places have been joined by flight.';
  } else if (publicState.active) {
    titleNode.textContent = 'A remembered circuit is in flight.';
    statusNode.textContent = publicState.nextLabel ? `Next known place: ${publicState.nextLabel}. Listen there to continue.` : 'Continue through the known places.';
  } else if (publicState.available) {
    titleNode.textContent = 'A short circuit can be flown here.';
    statusNode.textContent = 'Begin when you want a deliberate route through places you already know.';
  } else {
    titleNode.textContent = '';
    statusNode.textContent = '';
  }
  return publicState;
}

function refresh() {
  const result = derive();
  if (!result?.active && circuitState) circuitState = null;
  if (result?.circuit) circuitState = result.circuit;
  const publicState = publish(result);
  if (publicState.active && publicState.nextLabel) showJournal(`Known circuit: ${publicState.nextLabel} is the next remembered place.`);
  else if (!publicState.completed) {
    const node = journalNode();
    if (node && !journalTimer) {
      node.hidden = true;
      node.textContent = '';
    }
  }
}

function beginCircuit() {
  if (disposed) return;
  const result = derive({ startRequested: true });
  circuitState = result?.circuit ?? null;
  const publicState = publish(result);
  if (!publicState.active) return;
  const line = publicState.nextLabel ? `The circuit begins. First: ${publicState.nextLabel}.` : 'The circuit begins.';
  showJournal(line);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-landmark-circuit', {
    detail: Object.freeze({ ...publicState, event: 'started', line }),
  }));
}

function interact() {
  if (disposed || !circuitState) return false;
  const result = derive({ interactionRequested: true });
  circuitState = result?.circuit ?? null;
  const publicState = publish(result);
  if (publicState.completed) {
    const line = 'The three remembered places settle into one completed circuit.';
    showListening('The circuit closes.', line);
    showJournal(line, true);
    completionAtmosphere();
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-landmark-circuit', {
      detail: Object.freeze({ ...publicState, event: 'completed', line, soundHook: 'omen-confluence' }),
    }));
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
      detail: Object.freeze({ soundHook: 'omen-confluence', source: 'known-landmark-circuit' }),
    }));
    return true;
  }
  if (publicState.phase === 'advanced') {
    const line = publicState.nextLabel ? `The circuit turns onward. Next: ${publicState.nextLabel}.` : 'The circuit turns onward.';
    showListening('One known place joins the circuit.', line);
    showJournal(line);
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-landmark-circuit', {
      detail: Object.freeze({ ...publicState, event: 'advanced', line }),
    }));
    return true;
  }
  return false;
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyQ') interact();
}

function onInvestigated(event) {
  const landmarkId = typeof event?.detail?.landmarkId === 'string' ? event.detail.landmarkId.trim().slice(0, 120) : '';
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
  refresh();
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const base = priorGet ? priorGet() : currentState;
      if (!base || typeof base !== 'object') return base;
      return { ...base, knownLandmarkCircuit: globalThis.__greyblueKnownLandmarkCircuit };
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      refresh();
    },
  });
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithKnownCircuitCompletion(scene, camera) {
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

globalThis.__greyblueKnownLandmarkCircuit = Object.freeze({ available: false, active: false, phase: 'unavailable', nextLabel: null, completed: false });
startButton.addEventListener('click', beginCircuit);
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);
refresh();

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  startButton.removeEventListener('click', beginCircuit);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onInvestigated);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  panel.remove();
  delete globalThis.__greyblueKnownLandmarkCircuit;
}, { once: true });
