import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  completeRoostHomewardFlight,
  createRoostHomewardFlightState,
  roostHomewardFlightPublicState,
  stepRoostHomewardFlight,
} from './roost-homeward-flight.js';

let modelState = createRoostHomewardFlightState();
let completionPublished = false;
let pendingRest = null;
let journalTimer = 0;
let cachedWorld = null;
let cachedSeed = null;
let disposed = false;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function finitePosition(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
    ? Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}

function worldFor(seed) {
  const resolvedSeed = Number.isInteger(seed) ? seed : 1337;
  if (!cachedWorld || cachedSeed !== resolvedSeed) {
    cachedSeed = resolvedSeed;
    cachedWorld = buildArchipelago({ seed: resolvedSeed, count: 64, radius: 11000, minGap: 390 });
  }
  return cachedWorld;
}

function targetFor(state) {
  const recovery = globalThis.__greyblueRoostRecovery;
  const islandId = cleanId(recovery?.islandId ?? state?.earnedRoost?.islandId);
  const zoneId = cleanId(recovery?.zoneId ?? state?.earnedRoost?.landingZoneId);
  if (!islandId || !zoneId) return null;

  const discovered = new Set(Array.isArray(state?.discovered) ? state.discovered.map(cleanId).filter(Boolean) : []);
  if (!discovered.has(islandId)) return null;

  const world = worldFor(state?.seed);
  const island = Array.isArray(world?.islands) ? world.islands.find((entry) => cleanId(entry?.id) === islandId) : null;
  const zone = Array.isArray(island?.landingZones) ? island.landingZones.find((entry) => cleanId(entry?.id) === zoneId) : null;
  const radius = Number(zone?.radius);
  const center = finitePosition(zone);
  const regionId = cleanId(island?.regionId);
  if (!island || !zone || !center || !regionId || !Number.isFinite(radius) || radius <= 0) return null;

  return Object.freeze({ islandId, zoneId, regionId, center, radius });
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function frameFor(state) {
  return Object.freeze({
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    regionId: cleanId(state?.currentRegion?.id),
    position: finitePosition(state?.position),
  });
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function journalNode() {
  const journal = document.querySelector('#greyblue-exploration-journal');
  if (!journal) return null;
  let node = journal.querySelector('[data-greyblue-journal-roost-homeward-flight]');
  if (!node) {
    node = document.createElement('div');
    node.setAttribute('data-greyblue-journal-roost-homeward-flight', '');
    journal.append(node);
  }
  return node;
}

function showCompletion() {
  const line = 'The long way home closes only when the remembered shelf is under your feet again.';
  const node = journalNode();
  if (node) {
    node.hidden = false;
    node.textContent = line;
    if (journalTimer) clearTimeout(journalTimer);
    journalTimer = setTimeout(() => {
      journalTimer = 0;
      node.hidden = true;
      node.textContent = '';
    }, reducedMotion() ? 3200 : 7600);
  }

  const listening = document.querySelector('#greyblue-listening-pulse');
  if (listening) {
    const title = listening.querySelector('[data-greyblue-listening-title]');
    const status = listening.querySelector('[data-greyblue-listening-status]');
    listening.hidden = false;
    listening.dataset.found = 'true';
    listening.dataset.kind = 'roost-homeward-flight';
    if (title) title.textContent = 'The roost answers your return.';
    if (status) status.textContent = line;
  }

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:roost-homeward-flight', {
    detail: Object.freeze({ ...roostHomewardFlightPublicState(modelState), event: 'completed' }),
  }));
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
    detail: Object.freeze({ soundHook: 'omen-confluence', source: 'roost-homeward-flight' }),
  }));
}

function onRoostRest(event) {
  if (disposed || event?.detail?.beganRest !== true) return;
  const target = targetFor(currentState());
  pendingRest = target ? Object.freeze({ beganRest: true, islandId: target.islandId, zoneId: target.zoneId }) : null;
}

globalThis.addEventListener?.('greyblue:roost-rest', onRoostRest);

function step() {
  if (disposed) return;
  const state = currentState();
  const target = targetFor(state);
  modelState = stepRoostHomewardFlight({ state: modelState, frame: frameFor(state), target });
  if (pendingRest) {
    modelState = completeRoostHomewardFlight({ state: modelState, restEvent: pendingRest });
    pendingRest = null;
  }
  const publicState = roostHomewardFlightPublicState(modelState);
  globalThis.__greyblueRoostHomewardFlight = publicState;
  if (publicState.completed && !completionPublished) {
    completionPublished = true;
    showCompletion();
  }
  if (!publicState.completed && publicState.active) completionPublished = false;
}

globalThis.__greyblueRoostHomewardFlight = roostHomewardFlightPublicState(modelState);

const originalRender = THREE.WebGLRenderer.prototype.render;
const homewardRender = function renderWithRoostHomewardFlight(scene, camera) {
  step();
  return originalRender.call(this, scene, camera);
};
THREE.WebGLRenderer.prototype.render = homewardRender;

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:roost-rest', onRoostRest);
  if (journalTimer) clearTimeout(journalTimer);
  if (THREE.WebGLRenderer.prototype.render === homewardRender) THREE.WebGLRenderer.prototype.render = originalRender;
  delete globalThis.__greyblueRoostHomewardFlight;
}, { once: true });
