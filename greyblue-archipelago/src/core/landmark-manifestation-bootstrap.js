import * as THREE from 'three';
import { loadGame } from './save.js';
import {
  collectInvestigatedLandmarkIds,
  evaluateLandmarkManifestation,
  manifestationIntensity,
} from './landmark-manifestation.js';

const restored = loadGame();
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(restored?.exploration);
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const priorOnBeforeRender = THREE.Mesh.prototype.onBeforeRender;

function discovered(islandId) {
  const ids = globalThis.__greyblueState?.discovered;
  return Array.isArray(ids) && ids.includes(islandId);
}

function resetMaterial(material) {
  if (!material || Array.isArray(material)) return;
  if (material.emissive?.setHex) material.emissive.setHex(0x000000);
  if ('emissiveIntensity' in material) material.emissiveIntensity = 0;
}

function applyManifestation(mesh, material) {
  const island = mesh?.userData?.island;
  const landmarkId = island?.landmarkRecord?.id;
  if (typeof landmarkId !== 'string' || !landmarkId) return;

  const active = discovered(island.id) && investigatedLandmarkIds.has(landmarkId);
  let profile = mesh.userData.greyblueLandmarkManifestation ?? null;
  if (!active) {
    if (profile?.active) mesh.userData.greyblueLandmarkManifestation = null;
    resetMaterial(material);
    return;
  }

  if (!profile?.active || profile.landmarkId !== landmarkId) {
    profile = evaluateLandmarkManifestation({
      island,
      discoveredIslandIds: [island.id],
      investigatedLandmarkIds,
    });
    mesh.userData.greyblueLandmarkManifestation = profile;
  }
  if (!profile.active || !material || Array.isArray(material)) return;
  if (material.emissive?.setHex) material.emissive.setHex(profile.emissiveHex);
  if ('emissiveIntensity' in material) {
    material.emissiveIntensity = manifestationIntensity(
      profile,
      globalThis.performance?.now?.() / 1000,
      { reducedMotion },
    );
  }
}

THREE.Mesh.prototype.onBeforeRender = function onBeforeRender(...args) {
  if (typeof priorOnBeforeRender === 'function') priorOnBeforeRender.apply(this, args);
  applyManifestation(this, args[4] ?? this.material);
};

globalThis.addEventListener?.('greyblue:landmark-investigated', (event) => {
  const landmarkId = typeof event?.detail?.landmarkId === 'string'
    ? event.detail.landmarkId.trim().slice(0, 120)
    : '';
  if (landmarkId) investigatedLandmarkIds.add(landmarkId);
});
