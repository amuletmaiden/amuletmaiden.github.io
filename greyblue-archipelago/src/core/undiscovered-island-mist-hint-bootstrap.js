import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { deriveUndiscoveredIslandMistHint, undiscoveredIslandMistHintPublicState } from './undiscovered-island-mist-hint.js';

let world = null;
let worldSeed = null;
let current = Object.freeze({ active: false, hintClass: null, relative: null, distance: null });
let disposed = false;

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

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function derive() {
  const state = globalThis.__greyblueState ?? null;
  return deriveUndiscoveredIslandMistHint({
    world: getWorld(state),
    currentRegionId: cleanId(state?.currentRegion?.id),
    discoveredIslandIds: state?.discovered,
    position: state?.position,
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    crossingActive: crossingActive(state),
  });
}

function publish(result) {
  current = result;
  globalThis.__greyblueUndiscoveredIslandMistHint = undiscoveredIslandMistHintPublicState(result);
}

function mistMultiplier(result) {
  if (result?.active !== true) return 1;
  return result.hintClass === 'near' ? 1.055 : 1.025;
}

function soundDetail(result) {
  if (result?.active !== true || !result?.relative) return Object.freeze({ active: false, hintClass: null, pan: 0 });
  const length = Math.hypot(result.relative.x, result.relative.z);
  const pan = length > 0 ? Math.max(-0.72, Math.min(0.72, result.relative.x / length)) : 0;
  return Object.freeze({ active: true, hintClass: result.hintClass, pan });
}

publish(derive());

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithUndiscoveredIslandMistHint(scene, camera) {
  if (disposed) return originalRender.call(this, scene, camera);
  publish(derive());
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:undiscovered-island-mist-hint-sound', { detail: soundDetail(current) }));
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || !current.active) return originalRender.call(this, scene, camera);
  const authoredDensity = fog.density;
  fog.density = authoredDensity * mistMultiplier(current);
  try {
    return originalRender.call(this, scene, camera);
  } finally {
    fog.density = authoredDensity;
  }
};

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (THREE.WebGLRenderer.prototype.render !== originalRender) THREE.WebGLRenderer.prototype.render = originalRender;
}, { once: true });
