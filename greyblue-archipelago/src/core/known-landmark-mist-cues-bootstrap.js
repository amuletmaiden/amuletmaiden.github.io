import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import {
  deriveKnownLandmarkMistCues,
  knownLandmarkMistCuePublicState,
} from './known-landmark-mist-cues.js';

const MAX_CUES = 8;
const CUE_COLOR = Object.freeze({
  distant: 0xaac4ca,
  emerging: 0xc7dadd,
  near: 0xe4edef,
});
const CUE_OPACITY = Object.freeze({
  distant: 0.2,
  emerging: 0.34,
  near: 0.48,
});

let world = null;
let worldSeed = null;
let cueScene = null;
let cueGroup = null;
let cueGeometry = null;
let cueMeshes = [];
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(loadGame()?.exploration);

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
  if (globalThis.__greyblueRegionalAerialEcho?.active === true || globalThis.__greyblueRegionalAerialSkyRun?.active === true) return true;
  return false;
}

function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function highContrast() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches);
  } catch {
    return false;
  }
}

function ensureCuePool(scene) {
  if (!scene?.isScene) return null;
  if (cueGroup) {
    if (cueScene !== scene) {
      cueGroup.removeFromParent();
      scene.add(cueGroup);
      cueScene = scene;
    }
    return cueGroup;
  }

  cueGeometry = new THREE.RingGeometry(10, 13.5, 18);
  cueGroup = new THREE.Group();
  cueGroup.name = 'greyblue-known-landmark-mist-cues';
  cueMeshes = [];

  for (let index = 0; index < MAX_CUES; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: CUE_COLOR.distant,
      transparent: true,
      opacity: CUE_OPACITY.distant,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(cueGeometry, material);
    mesh.name = `greyblue-known-landmark-mist-cue-${index + 1}`;
    mesh.visible = false;
    mesh.renderOrder = 0;
    cueGroup.add(mesh);
    cueMeshes.push(mesh);
  }

  scene.add(cueGroup);
  cueScene = scene;
  return cueGroup;
}

function hideUnused(startIndex = 0) {
  for (let index = startIndex; index < cueMeshes.length; index += 1) cueMeshes[index].visible = false;
}

function derive(scene) {
  const state = currentState();
  const fogDensity = scene?.fog?.isFogExp2 && Number.isFinite(scene.fog.density) ? scene.fog.density : undefined;
  return deriveKnownLandmarkMistCues({
    world: getWorld(state),
    currentRegionId: currentRegionId(state),
    discoveredIslandIds: state?.discovered,
    investigatedLandmarkIds,
    position: state?.position,
    fogDensity,
    recoveryActive: Boolean(state?.collision?.requiresRecovery),
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    localizedInteractionActive: localizedInteractionActive(state),
    highContrast: highContrast(),
    reducedMotion: reducedMotion(),
  });
}

function present(scene, camera) {
  const result = derive(scene);
  const publicState = knownLandmarkMistCuePublicState(result);
  globalThis.__greyblueKnownLandmarkMistCues = publicState;

  if (!result.active || !camera || !ensureCuePool(scene)) {
    hideUnused(0);
    return;
  }

  const contrast = highContrast();
  let index = 0;
  for (const cue of result.cues) {
    const mesh = cueMeshes[index];
    if (!mesh) break;
    const cueClass = CUE_COLOR[cue.cueClass] ? cue.cueClass : 'distant';
    mesh.visible = true;
    mesh.position.set(cue.x, cue.y, cue.z);
    mesh.lookAt(camera.position);
    const scale = cueClass === 'near' ? 1.15 : cueClass === 'emerging' ? 1 : 0.82;
    mesh.scale.setScalar(scale);
    mesh.material.color.setHex(CUE_COLOR[cueClass]);
    mesh.material.opacity = Math.min(0.62, CUE_OPACITY[cueClass] * (contrast ? 1.25 : 1));
    mesh.userData.greyblueCueClass = cueClass;
    index += 1;
  }
  hideUnused(index);
}

function onInvestigated(event) {
  const landmarkId = cleanId(event?.detail?.landmarkId ?? event?.detail?.id);
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
}

globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);

globalThis.__greyblueKnownLandmarkMistCues = Object.freeze({ active: false, cueClass: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithKnownLandmarkMistCues(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
