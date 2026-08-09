import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  deriveKnownLandmarkRevisit,
  knownLandmarkRevisitPublicState,
} from './known-landmark-revisit.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let disposed = false;
let presenceKey = '';
let episodeSerial = 0;
let episodeId = null;
let previousEpisode = null;
let mistMultiplier = 1;
let mistTimer = 0;
let journalTimer = 0;
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(loadGame()?.exploration);

const VARIATION_LINES = Object.freeze({
  hush: 'The known place answers more quietly than before; the weather has changed its edges.',
  resonance: 'A familiar resonance returns with a different interval in the surrounding air.',
  weathering: 'The landmark shows a new weathered face without surrendering anything hidden.',
  glint: 'A brief glint catches on a detail already known, changed only by the present air.',
});
const MIST_MULTIPLIERS = Object.freeze({ hush: 0.985, resonance: 0.965, weathering: 1.015, glint: 0.975 });
const SOUND_HOOKS = Object.freeze({
  hush: 'omen-shared-silence',
  resonance: 'omen-answering-air',
  weathering: 'omen-measured-weather',
  glint: 'omen-confluence',
});

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function atmosphereClass(state) {
  const candidates = [
    state?.weather?.class,
    state?.currentWeather?.class,
    state?.currentRegion?.atmosphereClass,
    state?.fog?.atmosphereClass,
  ];
  for (const value of candidates) {
    if (value === 'clear' || value === 'mist' || value === 'rain' || value === 'storm' || value === 'cold' || value === 'warm') return value;
  }
  return 'clear';
}

function activeApproach(state) {
  const approach = state?.landmarkFlightApproach;
  if (!approach?.visible || approach?.alreadyInvestigated !== true) return null;
  const landmarkId = typeof approach.landmarkId === 'string' ? approach.landmarkId.trim().slice(0, 120) : '';
  const islandId = typeof approach.islandId === 'string' ? approach.islandId.trim().slice(0, 120) : '';
  const regionId = typeof state?.currentRegion?.id === 'string' ? state.currentRegion.id.trim().slice(0, 120) : '';
  if (!landmarkId || !islandId || !regionId) return null;
  return { landmarkId, islandId, regionId };
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function updateEpisode(state) {
  const approach = activeApproach(state);
  const nextKey = approach ? `${approach.regionId}:${approach.islandId}:${approach.landmarkId}` : '';
  if (!nextKey) {
    presenceKey = '';
    episodeId = null;
    previousEpisode = null;
    publishInactive();
    return;
  }
  if (nextKey !== presenceKey) {
    presenceKey = nextKey;
    episodeSerial += 1;
    episodeId = `${approach.landmarkId}:visit-${episodeSerial}`;
    previousEpisode = null;
  }
  const preview = derive(state, false);
  globalThis.__greyblueKnownLandmarkRevisit = knownLandmarkRevisitPublicState(preview);
}

function derive(state, interactionRequested) {
  const approach = activeApproach(state);
  if (!approach || !episodeId) return null;
  return deriveKnownLandmarkRevisit({
    world: getWorld(state),
    currentRegionId: approach.regionId,
    currentIslandId: approach.islandId,
    currentLandmarkId: approach.landmarkId,
    discoveredIslandIds: state?.discovered,
    investigatedLandmarkIds,
    encounterPresent: true,
    interactionRequested,
    recoveryActive: Boolean(state?.collision?.requiresRecovery),
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    currentAtmosphere: atmosphereClass(state),
    visitEpisodeId: episodeId,
    previousEpisode,
  });
}

function publishInactive() {
  globalThis.__greyblueKnownLandmarkRevisit = Object.freeze({ available: false, active: false, variation: null });
}

function showListening(line, variation) {
  const panel = document.querySelector('#greyblue-listening-pulse');
  if (!panel) return;
  const title = panel.querySelector('[data-greyblue-listening-title]');
  const status = panel.querySelector('[data-greyblue-listening-status]');
  panel.hidden = false;
  panel.dataset.found = 'true';
  panel.dataset.kind = 'known-landmark-revisit';
  delete panel.dataset.turn;
  delete panel.dataset.intensity;
  if (title) title.textContent = 'The known place answers differently.';
  if (status) status.textContent = line;
  panel.dataset.revisitVariation = variation;
}

function showJournal(line) {
  const panel = document.querySelector('#greyblue-exploration-journal');
  if (!panel) return;
  let node = panel.querySelector('[data-greyblue-journal-landmark-revisit]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-landmark-revisit', '');
    const omen = panel.querySelector('[data-greyblue-journal-omen]');
    if (omen) panel.insertBefore(node, omen);
    else panel.append(node);
  }
  node.hidden = false;
  node.textContent = line;
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    node.hidden = true;
    node.textContent = '';
  }, 8500);
}

function setMist(variation) {
  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = MIST_MULTIPLIERS[variation] ?? 1;
  const reducedMotion = (() => {
    try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
  })();
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion ? 1200 : 2200);
}

function respond() {
  if (disposed || !currentState?.ready || currentState?.paused) return false;
  const result = derive(currentState, true);
  const publicState = knownLandmarkRevisitPublicState(result);
  globalThis.__greyblueKnownLandmarkRevisit = publicState;
  if (!publicState.active) return false;
  previousEpisode = result.episode;
  const line = VARIATION_LINES[publicState.variation] ?? 'The known place answers differently in the present air.';
  showListening(line, publicState.variation);
  showJournal(line);
  setMist(publicState.variation);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-landmark-revisit', {
    detail: Object.freeze({ ...publicState, line, soundHook: SOUND_HOOKS[publicState.variation] ?? null }),
  }));
  const soundHook = SOUND_HOOKS[publicState.variation];
  if (soundHook) {
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
      detail: Object.freeze({ soundHook, source: 'known-landmark-revisit' }),
    }));
  }
  return true;
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'KeyQ') return;
  respond();
}

function onInvestigated(event) {
  const id = typeof event?.detail?.landmarkId === 'string' ? event.detail.landmarkId.trim().slice(0, 120) : '';
  if (id) investigatedLandmarkIds.add(id);
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const base = priorGet ? priorGet() : currentState;
      if (!base || typeof base !== 'object') return base;
      return { ...base, knownLandmarkRevisit: globalThis.__greyblueKnownLandmarkRevisit };
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      updateEpisode(currentState);
    },
  });
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithKnownLandmarkRevisit(scene, camera) {
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

publishInactive();
updateEpisode(currentState);
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (mistTimer) clearTimeout(mistTimer);
  if (journalTimer) clearTimeout(journalTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onInvestigated);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueKnownLandmarkRevisit;
}, { once: true });
