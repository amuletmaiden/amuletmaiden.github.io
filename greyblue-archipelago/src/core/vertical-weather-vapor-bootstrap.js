import * as THREE from 'three';
import {
  createVerticalWeatherVaporState,
  stepVerticalWeatherVapor,
  verticalWeatherVaporPresentation,
  verticalWeatherVaporPublicState,
} from './vertical-weather-vapor.js';

const MAX_SAMPLES = 6;
const VAPOR_COLOR = Object.freeze({
  low: 0xcdd9dc,
  mist: 0xdce5e6,
  break: 0xeaf0ef,
});

let vaporState = createVerticalWeatherVaporState();
let vaporScene = null;
let vaporGroup = null;
let vaporGeometry = null;
const vaporMeshes = [];

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function currentWeather() {
  const weather = globalThis.__greyblueVerticalWeatherSound;
  if (weather?.active !== true || typeof weather?.layer !== 'string') return Object.freeze({ active: false, layer: null });
  return Object.freeze({ active: true, layer: weather.layer });
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function highContrast() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches); } catch { return false; }
}

function presentationSampleCap() {
  const scale = Number(globalThis.__greyblueOptionalPresentationBudget?.historyScale);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) return MAX_SAMPLES;
  return Math.max(1, Math.min(MAX_SAMPLES, Math.round(MAX_SAMPLES * scale)));
}

function buildFrame(state, now) {
  return {
    ready: state?.ready === true,
    paused: state?.paused === true,
    airborne: state?.collision?.grounded === true ? false : state?.flight?.airborne !== false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    speed: state?.flight?.speed,
    position: state?.position,
    now,
    weather: currentWeather(),
  };
}

function ensurePool(scene) {
  if (!scene?.isScene) return null;
  if (vaporGroup) {
    if (vaporScene !== scene) {
      vaporGroup.removeFromParent();
      scene.add(vaporGroup);
      vaporScene = scene;
    }
    return vaporGroup;
  }

  vaporGeometry = new THREE.IcosahedronGeometry(1, 1);
  vaporGroup = new THREE.Group();
  vaporGroup.name = 'greyblue-vertical-weather-vapor';

  for (let index = 0; index < MAX_SAMPLES; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: VAPOR_COLOR.mist,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      fog: true,
    });
    const mesh = new THREE.Mesh(vaporGeometry, material);
    mesh.name = `greyblue-vertical-weather-vapor-${index + 1}`;
    mesh.visible = false;
    mesh.renderOrder = 0;
    vaporGroup.add(mesh);
    vaporMeshes.push(mesh);
  }

  scene.add(vaporGroup);
  vaporScene = scene;
  return vaporGroup;
}

function hideUnused(start = 0) {
  for (let index = start; index < vaporMeshes.length; index += 1) vaporMeshes[index].visible = false;
}

function present(scene) {
  const now = performance.now();
  vaporState = stepVerticalWeatherVapor({
    state: vaporState,
    frame: buildFrame(currentState(), now),
    reducedMotion: reducedMotion(),
  });
  globalThis.__greyblueVerticalWeatherVapor = verticalWeatherVaporPublicState(vaporState);

  const policy = verticalWeatherVaporPresentation(vaporState, { highContrast: highContrast() });
  if (!policy.active || !ensurePool(scene)) {
    hideUnused();
    return;
  }

  const samples = policy.history.slice(-presentationSampleCap());
  const newestIndex = Math.max(0, samples.length - 1);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const mesh = vaporMeshes[index];
    if (!mesh) break;
    const age = Math.max(0, now - sample.at);
    const lifetime = Math.max(1, policy.lifetimeMs);
    const ageStrength = Math.max(0, 1 - age / lifetime);
    const recency = newestIndex ? index / newestIndex : 1;
    const scale = policy.scale * (2.7 + recency * 1.5) * (0.9 + ageStrength * 0.18);

    mesh.visible = ageStrength > 0;
    mesh.position.set(sample.position.x, sample.position.y, sample.position.z);
    mesh.scale.set(scale * 1.35, scale * 0.66, scale);
    mesh.material.color.setHex(VAPOR_COLOR[policy.vaporClass] ?? VAPOR_COLOR.mist);
    mesh.material.opacity = policy.opacity * ageStrength * (0.3 + recency * 0.7);
    mesh.material.depthTest = true;
    mesh.material.depthWrite = false;
    mesh.material.fog = true;
    mesh.userData.greyblueVaporClass = policy.vaporClass;
  }
  hideUnused(samples.length);
}

globalThis.__greyblueVerticalWeatherVapor = Object.freeze({ active: false, vaporClass: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithVerticalWeatherVapor(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
