import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  stepRegionalAerialEcho,
  regionalAerialEchoPublicState,
} from './regional-aerial-echo.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let modelState = null;
let publicState = Object.freeze({ available: false, active: false, completed: false, echoClass: null });
let disposed = false;
let echoGroup = null;
let echoScene = null;
let journalTimer = 0;
const completedKeys = new Set();
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(loadGame()?.exploration);

const ECHO_COLORS = Object.freeze({
  wake: 0xb8dcff,
  ring: 0xd7c6ff,
  hush: 0xc7e7e2,
  weathering: 0xe0d3b7,
});

const COMPLETION_COPY = Object.freeze({
  wake: 'The old wake closes around the wings, then loosens into ordinary air.',
  ring: 'The ring gives once as the dragon passes through, answering a route already learned.',
  hush: 'The suspended hush breaks cleanly around the flight and settles behind it.',
  weathering: 'The weathered echo folds into the surrounding mist as the dragon crosses it.',
});

const COMPLETION_SOUND = Object.freeze({
  wake: 'omen-answering-air',
  ring: 'omen-confluence',
  hush: 'omen-shared-silence',
  weathering: 'omen-measured-weather',
});

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function currentRegionId(state) {
  return cleanId(state?.currentRegion?.id);
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

function memoryForCurrentRegion(state) {
  const memory = globalThis.__greyblueRegionalFlightMemory;
  const regionId = currentRegionId(state);
  if (!regionId || memory?.active !== true || memory?.remembered !== true) {
    return { regionId, remembered: false, memoryClass: null };
  }
  const memoryClass = ['wake', 'ring', 'hush', 'weathering'].includes(memory?.memoryClass)
    ? memory.memoryClass
    : null;
  return { regionId, remembered: Boolean(memoryClass), memoryClass };
}

function completionKey(regionId, memoryClass) {
  return regionId && memoryClass ? `${regionId}|${memoryClass}` : '';
}

function publish(result) {
  publicState = regionalAerialEchoPublicState(result);
  globalThis.__greyblueRegionalAerialEcho = publicState;
}

function publishCompleted(echoClass) {
  publicState = Object.freeze({ available: true, active: false, completed: true, echoClass });
  globalThis.__greyblueRegionalAerialEcho = publicState;
}

function removeEchoObject() {
  if (!echoGroup) return;
  echoGroup.removeFromParent();
  echoGroup.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
    else object.material?.dispose?.();
  });
  echoGroup = null;
  echoScene = null;
}

function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function ensureEchoObject(scene) {
  const echo = modelState?.active ? modelState.echo : null;
  if (!echo || !scene?.isScene) {
    removeEchoObject();
    return null;
  }

  if (echoGroup && echoScene !== scene) removeEchoObject();
  if (!echoGroup) {
    const color = ECHO_COLORS[modelState.echoClass] ?? 0xc9def2;
    const group = new THREE.Group();
    group.name = 'greyblue-regional-aerial-echo';

    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const innerMaterial = ringMaterial.clone();
    innerMaterial.opacity = 0.18;

    const outer = new THREE.Mesh(new THREE.TorusGeometry(64, 2.8, 8, 64), ringMaterial);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(47, 1.5, 8, 48), innerMaterial);
    inner.rotation.y = Math.PI * 0.5;
    group.add(outer, inner);
    group.position.set(echo.x, echo.y, echo.z);
    group.userData.greyblueEchoClass = modelState.echoClass;
    scene.add(group);
    echoGroup = group;
    echoScene = scene;
  }

  echoGroup.position.set(echo.x, echo.y, echo.z);
  return echoGroup;
}

function showCompletion(echoClass) {
  const line = COMPLETION_COPY[echoClass];
  if (!line) return;

  const listening = document.querySelector('#greyblue-listening-pulse');
  if (listening) {
    const title = listening.querySelector('[data-greyblue-listening-title]');
    const status = listening.querySelector('[data-greyblue-listening-status]');
    listening.hidden = false;
    listening.dataset.found = 'true';
    listening.dataset.kind = 'regional-aerial-echo';
    delete listening.dataset.turn;
    delete listening.dataset.intensity;
    if (title) title.textContent = 'The air answers the flight.';
    if (status) status.textContent = line;
  }

  const journal = document.querySelector('#greyblue-exploration-journal');
  if (journal) {
    let node = journal.querySelector('[data-greyblue-journal-aerial-echo]');
    if (!node) {
      node = document.createElement('div');
      node.dataset.greyblueJournalAerialEcho = '';
      const omen = journal.querySelector('[data-greyblue-journal-omen]');
      if (omen) omen.before(node);
      else journal.append(node);
    }
    node.hidden = false;
    node.textContent = `Flight echo: ${line}`;
    if (journalTimer) clearTimeout(journalTimer);
    journalTimer = setTimeout(() => {
      journalTimer = 0;
      node.hidden = true;
      node.textContent = '';
    }, 8500);
  }

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-aerial-echo-completed', {
    detail: Object.freeze({ echoClass }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({
      soundHook: COMPLETION_SOUND[echoClass] ?? 'omen-confluence',
      source: 'regional-aerial-echo',
    }),
  }));
}

function advance(listenRequested = false) {
  if (disposed || !currentState?.ready || currentState?.paused) return false;

  const { regionId, remembered, memoryClass } = memoryForCurrentRegion(currentState);
  const key = completionKey(regionId, memoryClass);
  if (key && completedKeys.has(key)) {
    modelState = null;
    removeEchoObject();
    publishCompleted(memoryClass);
    return false;
  }

  const next = stepRegionalAerialEcho({
    world: getWorld(currentState),
    currentRegionId: regionId,
    discoveredIslandIds: currentState?.discovered,
    investigatedLandmarkIds,
    remembered,
    memoryClass,
    listenRequested,
    position: currentState?.position,
    recoveryActive: Boolean(currentState?.collision?.requiresRecovery),
    crossingActive: crossingActive(currentState),
    restorePublishing: Boolean(currentState?.restorePublishing || currentState?.explorationRestorePublishing),
    localizedInteractionActive: localizedInteractionActive(currentState),
    state: modelState,
  });

  modelState = next;
  publish(next);

  if (next?.completed && key) {
    completedKeys.add(key);
    removeEchoObject();
    publishCompleted(memoryClass);
    showCompletion(memoryClass);
    return true;
  }

  if (!next?.active) removeEchoObject();
  return Boolean(next?.active);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'KeyQ') return;
  advance(true);
}

function onInvestigated(event) {
  const landmarkId = cleanId(event?.detail?.landmarkId);
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
  advance(false);
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const base = priorGet ? priorGet() : currentState;
      if (!base || typeof base !== 'object') return base;
      return { ...base, regionalAerialEcho: publicState };
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      advance(false);
    },
  });
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithRegionalAerialEcho(scene, camera) {
  const group = ensureEchoObject(scene);
  if (group && camera) {
    if (!reducedMotion()) {
      const phase = (performance.now?.() ?? Date.now()) * 0.00018;
      group.rotation.z = phase;
      group.children[1].rotation.x = phase * 0.7;
    } else {
      group.rotation.z = 0;
      group.children[1].rotation.x = 0;
    }
    group.lookAt(camera.position);
  }
  return originalRender.call(this, scene, camera);
};

globalThis.__greyblueRegionalAerialEcho = publicState;
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);
advance(false);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (journalTimer) clearTimeout(journalTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onInvestigated);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  removeEchoObject();
  delete globalThis.__greyblueRegionalAerialEcho;
}, { once: true });
