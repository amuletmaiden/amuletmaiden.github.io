import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  stepRegionalAerialEcho,
  regionalAerialEchoPublicState,
} from './regional-aerial-echo.js';
import {
  stepRegionalAerialSkyRun,
  regionalAerialSkyRunPublicState,
} from './regional-aerial-sky-run.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let modelState = null;
let skyRunState = null;
let publicState = Object.freeze({ available: false, active: false, completed: false, echoClass: null });
let skyRunPublicState = Object.freeze({ available: false, active: false, phase: null, echoClass: null, completed: false });
let disposed = false;
let echoGroup = null;
let echoScene = null;
let journalTimer = 0;
let mistTimer = 0;
let mistMultiplier = 1;
const completedKeys = new Set();
const completedSkyRunKeys = new Set();
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

const SKY_RUN_COPY = Object.freeze({
  first: 'A short run gathers in the known air. The first echo is already visible.',
  middle: 'The first passage answers. Another echo has gathered farther through the same known sky.',
  final: 'The run narrows to one last visible echo.',
});

const SKY_RUN_COMPLETE_COPY = Object.freeze({
  wake: 'The last wake folds shut behind the wings; the whole run has become ordinary air again.',
  ring: 'The final ring answers the earlier passages with one quiet interval, then disappears.',
  hush: 'The final hush parts around the dragon and leaves the remembered region briefly still.',
  weathering: 'The last weathered echo dissolves into the region’s mist, completing the flight line.',
});

const SKY_RUN_MIST = Object.freeze({ wake: 0.975, ring: 0.965, hush: 1.02, weathering: 0.985 });

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

function publishSkyRun(result) {
  skyRunPublicState = regionalAerialSkyRunPublicState(result);
  globalThis.__greyblueRegionalAerialSkyRun = skyRunPublicState;
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

function activeVisualState() {
  if (skyRunState?.active && skyRunState.echo) return skyRunState;
  if (modelState?.active && modelState.echo) return modelState;
  return null;
}

function ensureEchoObject(scene) {
  const visualState = activeVisualState();
  const echo = visualState?.echo;
  if (!echo || !scene?.isScene) {
    removeEchoObject();
    return null;
  }

  if (echoGroup && echoScene !== scene) removeEchoObject();
  if (!echoGroup) {
    const color = ECHO_COLORS[visualState.echoClass] ?? 0xc9def2;
    const group = new THREE.Group();
    group.name = 'greyblue-regional-aerial-echo';

    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: skyRunState?.active ? 0.5 : 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const innerMaterial = ringMaterial.clone();
    innerMaterial.opacity = skyRunState?.active ? 0.22 : 0.18;

    const outer = new THREE.Mesh(new THREE.TorusGeometry(64, 2.8, 8, 64), ringMaterial);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(47, 1.5, 8, 48), innerMaterial);
    inner.rotation.y = Math.PI * 0.5;
    group.add(outer, inner);
    group.position.set(echo.x, echo.y, echo.z);
    scene.add(group);
    echoGroup = group;
    echoScene = scene;
  }

  echoGroup.position.set(echo.x, echo.y, echo.z);
  echoGroup.userData.greyblueEchoClass = visualState.echoClass;
  echoGroup.userData.greyblueSkyRunPhase = skyRunState?.active ? skyRunState.phase : null;
  return echoGroup;
}

function ensureJournalNode(attributeName) {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector(`[${attributeName}]`);
  if (!node) {
    node = document.createElement('div');
    node.setAttribute(attributeName, '');
    const omen = journal.querySelector('[data-greyblue-journal-omen]');
    if (omen) omen.before(node);
    else journal.append(node);
  }
  return node;
}

function showListening(titleText, line, kind) {
  const listening = document.querySelector('#greyblue-listening-pulse');
  if (!listening) return;
  const title = listening.querySelector('[data-greyblue-listening-title]');
  const status = listening.querySelector('[data-greyblue-listening-status]');
  listening.hidden = false;
  listening.dataset.found = 'true';
  listening.dataset.kind = kind;
  delete listening.dataset.turn;
  delete listening.dataset.intensity;
  if (title) title.textContent = titleText;
  if (status) status.textContent = line;
}

function showJournal(line, attributeName) {
  const node = ensureJournalNode(attributeName);
  if (!node) return;
  node.hidden = false;
  node.textContent = line;
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = 0;
    node.hidden = true;
    node.textContent = '';
  }, 8500);
}

function showCompletion(echoClass) {
  const line = COMPLETION_COPY[echoClass];
  if (!line) return;
  showListening('The air answers the flight.', line, 'regional-aerial-echo');
  showJournal(`Flight echo: ${line}`, 'data-greyblue-journal-aerial-echo');

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

function showSkyRunProgress(phase) {
  const line = SKY_RUN_COPY[phase];
  if (!line) return;
  showListening('The known sky gathers into a flight line.', line, 'regional-aerial-sky-run');
  showJournal(`Sky run: ${line}`, 'data-greyblue-journal-aerial-sky-run');
}

function showSkyRunCompletion(echoClass) {
  const line = SKY_RUN_COMPLETE_COPY[echoClass] ?? 'The last echo closes and the known air settles behind the flight.';
  showListening('The flight line closes.', line, 'regional-aerial-sky-run');
  showJournal(`Sky run complete: ${line}`, 'data-greyblue-journal-aerial-sky-run');

  if (mistTimer) clearTimeout(mistTimer);
  mistMultiplier = SKY_RUN_MIST[echoClass] ?? 1;
  mistTimer = setTimeout(() => {
    mistTimer = 0;
    mistMultiplier = 1;
  }, reducedMotion() ? 900 : 1900);

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-aerial-sky-run-completed', {
    detail: Object.freeze({ echoClass }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'regional-aerial-sky-run' }),
  }));
}

function modelArguments(startRequested = false) {
  const { regionId, remembered, memoryClass } = memoryForCurrentRegion(currentState);
  return {
    regionId,
    remembered,
    memoryClass,
    common: {
      world: getWorld(currentState),
      currentRegionId: regionId,
      discoveredIslandIds: currentState?.discovered,
      investigatedLandmarkIds,
      remembered,
      memoryClass,
      position: currentState?.position,
      recoveryActive: Boolean(currentState?.collision?.requiresRecovery),
      crossingActive: crossingActive(currentState),
      restorePublishing: Boolean(currentState?.restorePublishing || currentState?.explorationRestorePublishing),
      localizedInteractionActive: localizedInteractionActive(currentState),
    },
    startRequested,
  };
}

function advanceSingle(listenRequested = false) {
  const { regionId, memoryClass, common } = modelArguments();
  const key = completionKey(regionId, memoryClass);
  if (key && completedKeys.has(key)) {
    modelState = null;
    publishCompleted(memoryClass);
    return false;
  }

  const next = stepRegionalAerialEcho({
    ...common,
    listenRequested,
    state: modelState,
  });
  modelState = next;
  publish(next);

  if (next?.completed && key) {
    completedKeys.add(key);
    modelState = null;
    removeEchoObject();
    publishCompleted(memoryClass);
    showCompletion(memoryClass);
    return true;
  }
  if (!next?.active && !skyRunState?.active) removeEchoObject();
  return Boolean(next?.active);
}

function advanceSkyRun(startRequested = false) {
  const { regionId, memoryClass, common } = modelArguments();
  const key = completionKey(regionId, memoryClass);
  const priorPhase = skyRunState?.active ? skyRunState.phase : null;
  const priorActive = Boolean(skyRunState?.active);
  const next = stepRegionalAerialSkyRun({
    ...common,
    startRequested,
    sessionCompleted: Boolean(key && completedSkyRunKeys.has(key)),
    state: skyRunState,
  });

  skyRunState = next;
  publishSkyRun(next);

  if (next?.active) {
    if (!priorActive || priorPhase !== next.phase) showSkyRunProgress(next.phase);
    modelState = null;
    publish(stepRegionalAerialEcho({ ...common }));
    return true;
  }

  if (next?.completed && key && !completedSkyRunKeys.has(key)) {
    completedSkyRunKeys.add(key);
    skyRunState = null;
    removeEchoObject();
    publishSkyRun(stepRegionalAerialSkyRun({ ...common, sessionCompleted: true }));
    showSkyRunCompletion(memoryClass);
    return true;
  }

  if (!modelState?.active) removeEchoObject();
  return false;
}

function refreshAvailability() {
  const { regionId, memoryClass, common } = modelArguments();
  const key = completionKey(regionId, memoryClass);
  if (!skyRunState?.active) {
    publishSkyRun(stepRegionalAerialSkyRun({
      ...common,
      sessionCompleted: Boolean(key && completedSkyRunKeys.has(key)),
    }));
  }
  if (!modelState?.active) {
    if (key && completedKeys.has(key)) publishCompleted(memoryClass);
    else publish(stepRegionalAerialEcho({ ...common }));
  }
}

function advance(listenRequested = false) {
  if (disposed || !currentState?.ready || currentState?.paused) return false;

  if (skyRunState?.active) return advanceSkyRun(false);
  if (modelState?.active) return advanceSingle(false);

  if (listenRequested) {
    const startedSkyRun = advanceSkyRun(true);
    if (startedSkyRun || skyRunPublicState.available || skyRunPublicState.completed) return startedSkyRun;
    return advanceSingle(true);
  }

  refreshAvailability();
  return false;
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
      return {
        ...base,
        regionalAerialEcho: publicState,
        regionalAerialSkyRun: skyRunPublicState,
      };
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
      const phase = (globalThis.performance?.now?.() ?? Date.now()) * 0.00018;
      group.children[1].rotation.x = phase * 0.7;
    } else {
      group.children[1].rotation.x = 0;
    }
    group.lookAt(camera.position);
  }

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

globalThis.__greyblueRegionalAerialEcho = publicState;
globalThis.__greyblueRegionalAerialSkyRun = skyRunPublicState;
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);
advance(false);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (journalTimer) clearTimeout(journalTimer);
  if (mistTimer) clearTimeout(mistTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onInvestigated);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
  removeEchoObject();
  delete globalThis.__greyblueRegionalAerialEcho;
  delete globalThis.__greyblueRegionalAerialSkyRun;
}, { once: true });
