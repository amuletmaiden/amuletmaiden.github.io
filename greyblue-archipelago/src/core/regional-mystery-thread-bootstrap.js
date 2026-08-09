import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import { deriveRegionalMysteryThread, regionalMysteryThreadPublicState } from './regional-mystery-thread.js';

const restored = loadGame();
const recognizedRegionIds = new Set(
  (Array.isArray(restored?.exploration?.events) ? restored.exploration.events : [])
    .filter((event) => event?.kind === 'regional-thread-recognized' && typeof event?.regionId === 'string')
    .map((event) => event.regionId.trim().slice(0, 120))
    .filter(Boolean),
);
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(restored?.exploration);
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let clearTimer = 0;
let journalNode = null;
let listeningNode = null;

const THREAD_COPY = Object.freeze({
  chorus: 'Several known resonances answer as one pattern.',
  instrument: 'The known instruments seem to belong to the same weather.',
  relic: 'The known relics share a pressure that was easy to miss alone.',
  threshold: 'The known thresholds seem to describe one larger boundary.',
});
const THREAD_SOUND = Object.freeze({
  chorus: 'omen-confluence',
  instrument: 'omen-measured-weather',
  relic: 'omen-shared-silence',
  threshold: 'omen-same-door',
});

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || seed !== worldSeed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function explorationForRecognition() {
  return {
    events: [...recognizedRegionIds].map((regionId) => ({
      kind: 'regional-thread-recognized',
      id: regionId,
      regionId,
      occurredAt: 0,
    })),
  };
}

function ensurePresentationNodes() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (journal && !journalNode?.isConnected) {
    journalNode = document.createElement('div');
    journalNode.dataset.greyblueJournalRegionalThread = '';
    journalNode.hidden = true;
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(journalNode);
    else journal.append(journalNode);
  }
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (listening && !listeningNode?.isConnected) {
    listeningNode = document.createElement('div');
    listeningNode.dataset.greyblueListeningRegionalThread = '';
    listeningNode.hidden = true;
    listening.append(listeningNode);
  }
}

function clearPresentation() {
  if (journalNode) {
    journalNode.hidden = true;
    journalNode.textContent = '';
  }
  if (listeningNode) {
    listeningNode.hidden = true;
    listeningNode.textContent = '';
  }
  delete document.documentElement.dataset.greyblueRegionalThread;
}

function present(publicState, line) {
  ensurePresentationNodes();
  if (journalNode) {
    journalNode.hidden = false;
    journalNode.textContent = line;
  }
  if (listeningNode) {
    listeningNode.hidden = false;
    listeningNode.textContent = line;
  }
  document.documentElement.dataset.greyblueRegionalThread = publicState.threadClass;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = 0;
    if (listeningNode) {
      listeningNode.hidden = true;
      listeningNode.textContent = '';
    }
    delete document.documentElement.dataset.greyblueRegionalThread;
  }, 8500);
}

function recognize() {
  if (!currentState?.ready || currentState.paused) return;
  const regionId = typeof currentState?.currentRegion?.id === 'string'
    ? currentState.currentRegion.id.trim().slice(0, 120)
    : '';
  if (!regionId) return;
  const result = deriveRegionalMysteryThread({
    world: getWorld(currentState),
    currentRegionId: regionId,
    discoveredIslandIds: currentState.discovered,
    investigatedLandmarkIds,
    exploration: explorationForRecognition(),
    listenRequested: true,
    recoveryActive: Boolean(currentState.collision?.requiresRecovery),
  });
  const publicState = regionalMysteryThreadPublicState(result);
  globalThis.__greyblueRegionalMysteryThread = publicState;
  if (!publicState.active || !publicState.threadClass) return;

  recognizedRegionIds.add(regionId);
  const line = THREAD_COPY[publicState.threadClass] ?? 'Several known mysteries answer as one pattern.';
  const detail = Object.freeze({
    active: true,
    recognized: true,
    threadClass: publicState.threadClass,
    line,
    soundHook: THREAD_SOUND[publicState.threadClass] ?? 'omen-confluence',
    regionId,
    occurredAt: Date.now(),
  });
  globalThis.__greyblueRegionalMysteryThread = Object.freeze({
    active: true,
    recognized: true,
    threadClass: publicState.threadClass,
  });
  present(publicState, line);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-mystery-thread', { detail }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: detail.soundHook }),
  }));
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyQ') recognize();
}

function onLandmarkInvestigated(event) {
  const landmarkId = typeof event?.detail?.landmarkId === 'string'
    ? event.detail.landmarkId.trim().slice(0, 120)
    : '';
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
}

function onRecognitionPersisted(event) {
  const regionId = typeof event?.detail?.regionId === 'string'
    ? event.detail.regionId.trim().slice(0, 120)
    : '';
  if (regionId) recognizedRegionIds.add(regionId);
}

globalThis.__greyblueRegionalMysteryThread = Object.freeze({ active: false, recognized: false, threadClass: null });
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
globalThis.addEventListener?.('greyblue:regional-thread-recognized', onRecognitionPersisted);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
    },
  });
}

ensurePresentationNodes();
globalThis.addEventListener?.('beforeunload', () => {
  if (clearTimer) clearTimeout(clearTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  globalThis.removeEventListener?.('greyblue:regional-thread-recognized', onRecognitionPersisted);
  journalNode?.remove();
  listeningNode?.remove();
  clearPresentation();
  delete globalThis.__greyblueRegionalMysteryThread;
}, { once: true });
