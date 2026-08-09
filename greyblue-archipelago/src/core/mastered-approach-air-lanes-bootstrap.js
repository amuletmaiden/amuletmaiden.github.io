import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { masteredApproachIdsFromExploration } from './exploration-lifecycle.js';
import {
  deriveMasteredApproachAirLanes,
  masteredApproachAirLanePresentationPolicy,
  masteredApproachAirLanePublicState,
} from './mastered-approach-air-lanes.js';

const MAX_LANES = 3;
const TRACE_COUNT = 5;
const MAX_TRACES = MAX_LANES * TRACE_COUNT;
const TRACE_COLOR = Object.freeze({
  faint: 0x8fa9ad,
  clear: 0xb8cdd0,
  final: 0xdde8e9,
});

let world = null;
let worldSeed = null;
let laneScene = null;
let laneGroup = null;
let traceGeometry = null;
const traceMeshes = [];
const masteredCorridorIds = new Set(masteredApproachIdsFromExploration(loadGame()?.exploration));

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
  if (laneGroup) {
    if (laneScene !== scene) {
      laneGroup.removeFromParent();
      scene.add(laneGroup);
      laneScene = scene;
    }
    return laneGroup;
  }

  traceGeometry = new THREE.TorusGeometry(30, 1.35, 6, 24);
  laneGroup = new THREE.Group();
  laneGroup.name = 'greyblue-mastered-approach-air-lanes';

  for (let index = 0; index < MAX_TRACES; index += 1) {
    const policy = masteredApproachAirLanePresentationPolicy('faint');
    const material = new THREE.MeshBasicMaterial({
      color: TRACE_COLOR.faint,
      transparent: true,
      opacity: policy.opacity,
      depthTest: policy.depthTest,
      depthWrite: policy.depthWrite,
      fog: policy.fog,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(traceGeometry, material);
    mesh.name = `greyblue-mastered-approach-air-lane-trace-${index + 1}`;
    mesh.visible = false;
    mesh.renderOrder = 0;
    laneGroup.add(mesh);
    traceMeshes.push(mesh);
  }

  scene.add(laneGroup);
  laneScene = scene;
  return laneGroup;
}

function hideUnused(start = 0) {
  for (let index = start; index < traceMeshes.length; index += 1) traceMeshes[index].visible = false;
}

function derive() {
  const state = currentState();
  return deriveMasteredApproachAirLanes({
    world: getWorld(state),
    currentRegionId: cleanId(state?.currentRegion?.id),
    discoveredIslandIds: state?.discovered,
    masteredCorridorIds: [...masteredCorridorIds],
    position: state?.position,
    airborne: state?.flight?.airborne !== false && state?.collision?.grounded !== true,
    recoveryActive: state?.collision?.requiresRecovery === true,
    crossingActive: crossingActive(state),
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    highContrast: highContrast(),
    reducedMotion: reducedMotion(),
  });
}

function traceHeading(trace, index) {
  const previous = trace[Math.max(0, index - 1)];
  const next = trace[Math.min(trace.length - 1, index + 1)];
  const dx = Number(next?.x) - Number(previous?.x);
  const dz = Number(next?.z) - Number(previous?.z);
  return Number.isFinite(dx) && Number.isFinite(dz) ? Math.atan2(dx, dz) : 0;
}

function present(scene) {
  const result = derive();
  globalThis.__greyblueMasteredApproachAirLanes = masteredApproachAirLanePublicState(result);
  if (!result.active || !ensurePool(scene)) {
    hideUnused();
    return;
  }

  const contrast = highContrast();
  let meshIndex = 0;
  for (const lane of result.lanes) {
    const policy = masteredApproachAirLanePresentationPolicy(lane.laneClass, { highContrast: contrast });
    for (let traceIndex = 0; traceIndex < lane.trace.length; traceIndex += 1) {
      const point = lane.trace[traceIndex];
      const mesh = traceMeshes[meshIndex];
      if (!mesh) break;
      const taper = 0.82 + traceIndex * 0.045;
      mesh.visible = true;
      mesh.position.set(point.x, point.y, point.z);
      mesh.rotation.set(0, traceHeading(lane.trace, traceIndex), 0);
      mesh.scale.setScalar(taper);
      mesh.material.color.setHex(TRACE_COLOR[policy.laneClass] ?? TRACE_COLOR.faint);
      mesh.material.opacity = Math.max(0.08, policy.opacity * (0.74 + traceIndex * 0.055));
      mesh.material.depthTest = policy.depthTest;
      mesh.material.depthWrite = policy.depthWrite;
      mesh.material.fog = policy.fog;
      mesh.userData.greyblueLaneClass = policy.laneClass;
      meshIndex += 1;
    }
  }
  hideUnused(meshIndex);
}

function onApproachMastered(event) {
  const corridorId = cleanId(event?.detail?.corridorId);
  if (corridorId) masteredCorridorIds.add(corridorId);
}

globalThis.__greyblueMasteredApproachAirLanes = Object.freeze({ active: false, laneClass: null });
globalThis.addEventListener?.('greyblue:approach-mastered', onApproachMastered);

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithMasteredApproachAirLanes(scene, camera) {
  present(scene, camera);
  return originalRender.call(this, scene, camera);
};
