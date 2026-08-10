import * as THREE from 'three';
import {
  createBankMistArcState,
  stepBankMistArcs,
  bankMistArcPresentation,
  bankMistArcPublicState,
} from './bank-mist-arcs.js';

const MAX_SAMPLES = 8;
const MESH_COUNT = MAX_SAMPLES * 2;
const ARC_COLOR = 0xd9e3e2;

let arcState = createBankMistArcState();
let arcScene = null;
let arcGroup = null;
let arcGeometry = null;
let arcMeshes = [];

function currentState() {
  return globalThis.__greyblueState ?? null;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function highContrast() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches); } catch { return false; }
}

function buildFrame(state) {
  return {
    ready: state?.ready === true,
    paused: state?.paused === true,
    grounded: state?.collision?.grounded === true || state?.flight?.airborne === false,
    recoveryActive: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    position: state?.position,
    speed: state?.flight?.speed,
    bank: state?.flight?.bank,
    yaw: state?.flight?.yaw,
    fogDensity: state?.fog?.effectiveDensity ?? state?.fog?.density,
  };
}

function ensurePool(scene) {
  if (!scene?.isScene) return null;
  if (arcGroup) {
    if (arcScene !== scene) {
      arcGroup.removeFromParent();
      scene.add(arcGroup);
      arcScene = scene;
    }
    return arcGroup;
  }

  arcGeometry = new THREE.TorusGeometry(1, 0.075, 6, 18, Math.PI * 0.72);
  arcGroup = new THREE.Group();
  arcGroup.name = 'greyblue-bank-mist-arcs';

  for (let index = 0; index < MESH_COUNT; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: ARC_COLOR,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(arcGeometry, material);
    mesh.name = `greyblue-bank-mist-arc-${index + 1}`;
    mesh.visible = false;
    mesh.renderOrder = 0;
    arcGroup.add(mesh);
    arcMeshes.push(mesh);
  }

  scene.add(arcGroup);
  arcScene = scene;
  return arcGroup;
}

function hideUnused(start = 0) {
  for (let index = start; index < arcMeshes.length; index += 1) arcMeshes[index].visible = false;
}

function placeArc(mesh, sample, side, opacity, recency) {
  const lateralX = Math.cos(sample.yaw) * side;
  const lateralZ = -Math.sin(sample.yaw) * side;
  const wingOffset = 5.4;
  const backwardX = -Math.sin(sample.yaw) * (2.3 + recency * 1.8);
  const backwardZ = -Math.cos(sample.yaw) * (2.3 + recency * 1.8);
  const bankLift = Math.abs(sample.bank) * 2.2;

  mesh.visible = true;
  mesh.position.set(
    sample.x + lateralX * wingOffset + backwardX,
    sample.y + side * sample.bank * 2.4 - bankLift * 0.25,
    sample.z + lateralZ * wingOffset + backwardZ,
  );
  mesh.rotation.set(Math.PI * 0.5 + sample.bank * 0.55, sample.yaw, sample.turnClass === 'left' ? Math.PI * 0.18 : -Math.PI * 0.18);
  const scale = 3.2 + Math.max(0.18, Math.min(1, sample.strength)) * 2.6;
  mesh.scale.set(scale * 1.25, scale, scale);
  mesh.material.opacity = opacity * (0.26 + recency * 0.74) * Math.max(0.18, Math.min(1, sample.strength));
  mesh.userData.greyblueTurnClass = sample.turnClass;
}

function present(scene) {
  const state = currentState();
  arcState = stepBankMistArcs({
    state: arcState,
    frame: buildFrame(state),
    now: performance.now(),
    reducedMotion: reducedMotion(),
  });

  globalThis.__greyblueBankMistArcs = bankMistArcPublicState(arcState);
  const policy = bankMistArcPresentation(arcState, { highContrast: highContrast() });
  if (!policy.active || !ensurePool(scene)) {
    hideUnused();
    return;
  }

  const samples = arcState.samples.slice(-MAX_SAMPLES);
  const newestIndex = Math.max(0, samples.length - 1);
  let meshIndex = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const recency = newestIndex ? index / newestIndex : 1;
    placeArc(arcMeshes[meshIndex], sample, -1, policy.opacity, recency);
    meshIndex += 1;
    placeArc(arcMeshes[meshIndex], sample, 1, policy.opacity, recency);
    meshIndex += 1;
  }
  hideUnused(meshIndex);
}

globalThis.__greyblueBankMistArcs = Object.freeze({ active: false, turnClass: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithBankMistArcs(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
