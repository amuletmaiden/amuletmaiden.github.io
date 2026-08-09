import * as THREE from 'three';
import { loadGame } from './save.js';
import {
  collectRegionalFlightMemories,
  regionalFlightMemoryPublicState,
} from './regional-flight-memory.js';

const restored = loadGame();
const memories = collectRegionalFlightMemories(restored?.exploration);
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let publicState = Object.freeze({ active: false, remembered: false, memoryClass: null });
let clearTimer = 0;
let mistTimer = 0;
let mistMultiplier = 1;
let journalNode = null;
let listeningNode = null;
let disposed = false;

const MEMORY_COPY = Object.freeze({
  wake: 'Old flights seem to have left a faint wake in the region’s air.',
  ring: 'The known places answer one another with a quiet sense of return.',
  hush: 'The region has acquired a hush that belongs to paths already flown.',
  weathering: 'Repeated passage has made the region’s weather feel familiar at the edges.',
});

const MEMORY_SOUND = Object.freeze({
  wake: 'omen-confluence',
  ring: 'omen-same-door',
  hush: 'omen-shared-silence',
  weathering: 'omen-measured-weather',
});

const MEMORY_MIST = Object.freeze({
  wake: 0.965,
  ring: 1.035,
  hush: 1.045,
  weathering: 0.975,
});

function regionIdFromState(state) {
  return typeof state?.currentRegion?.id === 'string'
    ? state.currentRegion.id.trim().slice(0, 120)
    : '';
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function localizedInteractionActive(state) {
  if (state?.landmarkFlightApproach?.visible === true) return true;
  if (globalThis.__greyblueKnownLandmarkCircuit?.active === true) return true;
  if (globalThis.__greyblueKnownLandmarkRevisit?.available === true || globalThis.__greyblueKnownLandmarkRevisit?.active === true) return true;
  return false;
}

function explorationSnapshot() {
  return {
    events: [...memories.values()].map((memory) => ({
      kind: 'regional-flight-memory',
      id: memory.regionId,
      regionId: memory.regionId,
      memoryClass: memory.memoryClass,
      occurredAt: 0,
    })),
  };
}

function derivePublicState() {
  publicState = regionalFlightMemoryPublicState({
    exploration: explorationSnapshot(),
    currentRegionId: regionIdFromState(currentState),
  });
  globalThis.__greyblueRegionalFlightMemory = publicState;
  return publicState;
}

function ensureNodes() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (journal && !journalNode?.isConnected) {
    journalNode = document.createElement('div');
    journalNode.dataset.greyblueJournalRegionalFlightMemory = '';
    journalNode.hidden = true;
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(journalNode);
    else journal.append(journalNode);
  }
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (listening && !listeningNode?.isConnected) {
    listeningNode = document.createElement('div');
    listeningNode.dataset.greyblueListeningRegionalFlightMemory = '';
    listeningNode.hidden = true;
    listening.append(listeningNode);
  }
}

function clearTransientPresentation() {
  if (listeningNode) {
    listeningNode.hidden = true;
    listeningNode.textContent = '';
  }
  delete document.documentElement.dataset.greyblueRegionalFlightMemory;
}

function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function present(memoryClass) {
  const line = MEMORY_COPY[memoryClass];
  if (!line) return false;
  ensureNodes();
  if (journalNode) {
    journalNode.hidden = false;
    journalNode.textContent = `Flight memory: ${line}`;
  }
  if (listeningNode) {
    listeningNode.hidden = false;
    listeningNode.textContent = line;
  }
  document.documentElement.dataset.greyblueRegionalFlightMemory = memoryClass;

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = 0;
    clearTransientPresentation();
  }, 8000);

  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = MEMORY_MIST[memoryClass] ?? 1;
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 900 : 2200);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({
      soundHook: MEMORY_SOUND[memoryClass] ?? 'omen-confluence',
      source: 'regional-flight-memory',
    }),
  }));
  return true;
}

function listen() {
  if (disposed || !currentState?.ready || currentState.paused) return false;
  if (currentState?.collision?.requiresRecovery || crossingActive(currentState) || localizedInteractionActive(currentState)) return false;
  const state = derivePublicState();
  if (!state.active || !state.remembered || !state.memoryClass) return false;
  return present(state.memoryClass);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyQ') listen();
}

function onMemoryPersisted(event) {
  const regionId = typeof event?.detail?.regionId === 'string'
    ? event.detail.regionId.trim().slice(0, 120)
    : '';
  const memoryClass = typeof event?.detail?.memoryClass === 'string'
    ? event.detail.memoryClass.trim()
    : '';
  if (!regionId || !['wake', 'ring', 'hush', 'weathering'].includes(memoryClass)) return;
  if (!memories.has(regionId)) memories.set(regionId, Object.freeze({ regionId, memoryClass }));
  derivePublicState();
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const base = priorGet ? priorGet() : currentState;
      if (!base || typeof base !== 'object') return base;
      return { ...base, regionalFlightMemory: publicState };
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      derivePublicState();
    },
  });
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithRegionalFlightMemory(scene, camera) {
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

globalThis.__greyblueRegionalFlightMemory = publicState;
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:regional-flight-memory', onMemoryPersisted);
derivePublicState();
ensureNodes();

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (clearTimer) clearTimeout(clearTimer);
  if (mistTimer) clearTimeout(mistTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:regional-flight-memory', onMemoryPersisted);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  journalNode?.remove();
  listeningNode?.remove();
  clearTransientPresentation();
  delete globalThis.__greyblueRegionalFlightMemory;
}, { once: true });
