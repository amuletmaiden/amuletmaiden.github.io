import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  deriveDiscoveredLandingShelfCues,
  discoveredLandingShelfPresentationPolicy,
  discoveredLandingShelfCuePublicState,
} from './discovered-landing-shelf-cues.js';

const MAX_CUES = 6;
const CUE_COLOR = Object.freeze({
  acquiring: 0x9fb8bd,
  readable: 0xc4d5d7,
  final: 0xe3ecec,
});

let world = null;
let worldSeed = null;
let cueScene = null;
let cueGroup = null;
let cueGeometry = null;
let cueMeshes = [];

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function currentState() {
  return globalThis.__greyblueState ?? null;
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
  if (state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing') return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function highContrast() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches); } catch { return false; }
}

function ensurePool(scene) {
  if (!scene?.isScene) return null;
  if (cueGroup) {
    if (cueScene !== scene) {
      cueGroup.removeFromParent();
      scene.add(cueGroup);
      cueScene = scene;
    }
    return cueGroup;
  }

  cueGeometry = new THREE.RingGeometry(0.84, 1, 32);
  cueGroup = new THREE.Group();
  cueGroup.name = 'greyblue-discovered-landing-shelf-cues';

  for (let index = 0; index < MAX_CUES; index += 1) {
    const policy = discoveredLandingShelfPresentationPolicy('acquiring');
    const material = new THREE.MeshBasicMaterial({
      color: CUE_COLOR.acquiring,
      transparent: true,
      opacity: policy.opacity,
      depthTest: policy.depthTest,
      depthWrite: policy.depthWrite,
      fog: policy.fog,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(cueGeometry, material);
    mesh.name = `greyblue-discovered-landing-shelf-cue-${index + 1}`;
    mesh.visible = false;
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.renderOrder = 0;
    cueGroup.add(mesh);
    cueMeshes.push(mesh);
  }

  scene.add(cueGroup);
  cueScene = scene;
  return cueGroup;
}

function hideUnused(start = 0) {
  for (let index = start; index < cueMeshes.length; index += 1) cueMeshes[index].visible = false;
}

function derive() {
  const state = currentState();
  return deriveDiscoveredLandingShelfCues({
    world: getWorld(state),
    currentRegionId: cleanId(state?.currentRegion?.id),
    discoveredIslandIds: state?.discovered,
    position: state?.position,
    grounded: state?.collision?.grounded === true && state?.flight?.airborne !== true,
    recoveryActive: state?.collision?.requiresRecovery === true,
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    highContrast: highContrast(),
    reducedMotion: reducedMotion(),
  });
}

function present(scene) {
  const result = derive();
  globalThis.__greyblueDiscoveredLandingShelfCues = discoveredLandingShelfCuePublicState(result);
  if (!result.active || !ensurePool(scene)) {
    hideUnused();
    return;
  }

  const contrast = highContrast();
  let index = 0;
  for (const cue of result.cues) {
    const mesh = cueMeshes[index];
    if (!mesh) break;
    const policy = discoveredLandingShelfPresentationPolicy(cue.approachClass, { highContrast: contrast });
    mesh.visible = true;
    mesh.position.set(cue.x, cue.y + 2.5, cue.z);
    mesh.scale.set(cue.radius, cue.radius, cue.radius);
    mesh.material.color.setHex(CUE_COLOR[policy.approachClass] ?? CUE_COLOR.acquiring);
    mesh.material.opacity = policy.opacity;
    mesh.material.depthTest = policy.depthTest;
    mesh.material.depthWrite = policy.depthWrite;
    mesh.material.fog = policy.fog;
    mesh.userData.greyblueApproachClass = policy.approachClass;
    index += 1;
  }
  hideUnused(index);
}

globalThis.__greyblueDiscoveredLandingShelfCues = Object.freeze({ active: false, approachClass: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithDiscoveredLandingShelfCues(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
