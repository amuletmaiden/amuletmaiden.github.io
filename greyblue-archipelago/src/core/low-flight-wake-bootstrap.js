import * as THREE from 'three';
import {
  createLowFlightWakeState,
  stepLowFlightWake,
  lowFlightWakePresentation,
  lowFlightWakePublicState,
} from './low-flight-wake.js';

const MAX_SAMPLES = 10;
const WAKE_COLOR = Object.freeze({
  water: 0xbfdde3,
  mist: 0xd7e1df,
});

let wakeState = createLowFlightWakeState();
let wakeScene = null;
let wakeGroup = null;
let wakeGeometry = null;
let wakeMeshes = [];

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function highContrast() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches); } catch { return false; }
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function restorePublishing(state) {
  return Boolean(state?.restorePublishing || state?.explorationRestorePublishing);
}

function buildFrame(state) {
  const surface = state?.surface;
  return {
    ready: state?.ready === true,
    paused: state?.paused === true,
    grounded: state?.collision?.grounded === true || state?.flight?.airborne === false,
    recoveryActive: state?.collision?.requiresRecovery === true,
    restorePublishing: restorePublishing(state) || crossingActive(state),
    position: state?.position,
    speed: state?.flight?.speed,
    surfaceHeight: surface?.height,
    surface: surface?.surface,
    fogDensity: state?.fog?.effectiveDensity ?? state?.fog?.density,
  };
}

function ensurePool(scene) {
  if (!scene?.isScene) return null;
  if (wakeGroup) {
    if (wakeScene !== scene) {
      wakeGroup.removeFromParent();
      scene.add(wakeGroup);
      wakeScene = scene;
    }
    return wakeGroup;
  }

  wakeGeometry = new THREE.RingGeometry(0.58, 1, 28);
  wakeGroup = new THREE.Group();
  wakeGroup.name = 'greyblue-low-flight-wake';

  for (let index = 0; index < MAX_SAMPLES; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: WAKE_COLOR.water,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(wakeGeometry, material);
    mesh.name = `greyblue-low-flight-wake-${index + 1}`;
    mesh.visible = false;
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.renderOrder = 0;
    wakeGroup.add(mesh);
    wakeMeshes.push(mesh);
  }

  scene.add(wakeGroup);
  wakeScene = scene;
  return wakeGroup;
}

function hideUnused(start = 0) {
  for (let index = start; index < wakeMeshes.length; index += 1) wakeMeshes[index].visible = false;
}

function present(scene) {
  const state = currentState();
  wakeState = stepLowFlightWake({
    state: wakeState,
    frame: buildFrame(state),
    now: performance.now(),
    reducedMotion: reducedMotion(),
  });

  const publicState = lowFlightWakePublicState(wakeState);
  globalThis.__greyblueLowFlightWake = publicState;
  const policy = lowFlightWakePresentation(wakeState, { highContrast: highContrast() });
  if (!policy.active || !ensurePool(scene)) {
    hideUnused();
    return;
  }

  const samples = wakeState.samples.slice(-MAX_SAMPLES);
  const newestIndex = Math.max(0, samples.length - 1);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const mesh = wakeMeshes[index];
    if (!mesh) break;
    const age = newestIndex ? index / newestIndex : 1;
    const strength = Math.max(0.2, Math.min(1, Number(sample.strength) || 0));
    const scale = (sample.wakeClass === 'water' ? 11 : 8) * (0.72 + age * 0.5) * (0.82 + strength * 0.22);
    mesh.visible = true;
    mesh.position.set(sample.x, sample.y - Math.min(4, Number(sample.clearance) || 0), sample.z);
    mesh.scale.set(scale * 1.45, scale, scale);
    mesh.material.color.setHex(WAKE_COLOR[sample.wakeClass] ?? WAKE_COLOR.mist);
    mesh.material.opacity = policy.opacity * (0.28 + age * 0.72) * strength;
    mesh.material.depthTest = policy.depthTest;
    mesh.material.depthWrite = policy.depthWrite;
    mesh.material.fog = policy.fog;
    mesh.userData.greyblueWakeClass = sample.wakeClass;
  }
  hideUnused(samples.length);
}

globalThis.__greyblueLowFlightWake = Object.freeze({ active: false, wakeClass: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithLowFlightWake(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
