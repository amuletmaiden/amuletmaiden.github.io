import {
  clearStreamedIslandTransition,
  resetStreamedIslandTransition,
  streamedIslandMistOpacity,
} from './streamed-island-mist-transition.js';
import { profileStreamedIslandVertices } from './streamed-island-geology.js';

const COLORS = Object.freeze({ ordinary: 0x536e64, landmark: 0x607f74 });

function isMeshLike(value) {
  return Boolean(value && value.position && value.scale && value.userData && value.geometry && value.material);
}

function defaultNow() {
  return typeof performance?.now === 'function' ? performance.now() : 0;
}

function defaultReducedMotion() {
  return typeof globalThis.matchMedia === 'function'
    ? Boolean(globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)
    : false;
}

function cameraDistance(mesh, camera) {
  const cameraPosition = camera?.position;
  if (!cameraPosition) return 0;
  const dx = Number(mesh.position?.x ?? mesh.position?.values?.[0] ?? 0) - Number(cameraPosition.x ?? cameraPosition.values?.[0] ?? 0);
  const dz = Number(mesh.position?.z ?? mesh.position?.values?.[2] ?? 0) - Number(cameraPosition.z ?? cameraPosition.values?.[2] ?? 0);
  return Math.hypot(Number.isFinite(dx) ? dx : 0, Number.isFinite(dz) ? dz : 0);
}

function captureBasePositions(geometry) {
  const source = geometry?.attributes?.position?.array;
  if (!source || typeof source.length !== 'number') return null;
  const base = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const value = Number(source[index]);
    if (!Number.isFinite(value)) return null;
    base[index] = value;
  }
  return base;
}

function applyIslandGeology(geometry, basePositions, island) {
  const attribute = geometry?.attributes?.position;
  if (!attribute?.array || !basePositions || attribute.array.length !== basePositions.length) return false;
  const profiled = profileStreamedIslandVertices(basePositions, island);
  if (profiled.length !== basePositions.length) return false;
  attribute.array.set(profiled);
  attribute.needsUpdate = true;
  geometry.computeVertexNormals?.();
  geometry.computeBoundingBox?.();
  geometry.computeBoundingSphere?.();
  return true;
}

export function createStreamedIslandThreeAdapter({
  THREE,
  scene,
  islandMeshes,
  now = defaultNow,
  reducedMotion = defaultReducedMotion,
} = {}) {
  if (!THREE?.ConeGeometry || !THREE?.MeshStandardMaterial || !THREE?.Mesh) {
    throw new TypeError('streamed island Three adapter requires THREE geometry/material/mesh constructors');
  }
  if (!scene || typeof scene.add !== 'function' || typeof scene.remove !== 'function') {
    throw new TypeError('streamed island Three adapter requires a scene');
  }
  if (!(islandMeshes instanceof Map)) {
    throw new TypeError('streamed island Three adapter requires islandMeshes Map');
  }
  if (typeof now !== 'function' || typeof reducedMotion !== 'function') {
    throw new TypeError('streamed island Three adapter requires functional time/accessibility adapters');
  }

  function create(kind) {
    const geometry = new THREE.ConeGeometry(110, 1, 9, 3);
    geometry.translate(0, -0.42, 0);
    const basePositions = captureBasePositions(geometry);
    const material = new THREE.MeshStandardMaterial({
      color: COLORS[kind] ?? COLORS.ordinary,
      roughness: 0.96,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.userData = {};
    mesh.onBeforeRender = (_renderer, renderScene, camera) => {
      const transition = mesh.userData?.streamTransition;
      if (!mesh.visible || !transition || !mesh.material) return;
      const fogDensity = Number(renderScene?.fog?.density ?? scene?.fog?.density ?? 0);
      const ageMs = Math.max(0, Number(now()) - Number(transition.activatedAtMs || 0));
      const result = streamedIslandMistOpacity({
        ageMs,
        distance: cameraDistance(mesh, camera),
        fogDensity: Number.isFinite(fogDensity) ? fogDensity : 0,
        reducedMotion: Boolean(reducedMotion()),
      });
      mesh.material.transparent = result.opacity < 0.999;
      mesh.material.opacity = result.opacity;
      mesh.userData.streamTransition = Object.freeze({
        activatedAtMs: transition.activatedAtMs,
        opacity: result.opacity,
        transitioning: result.transitioning,
      });
    };
    mesh.userData.streamedIslandBasePositions = basePositions;
    return mesh;
  }

  function reset(mesh, island, kind) {
    if (!isMeshLike(mesh)) return;

    const previousId = typeof mesh.userData?.island?.id === 'string'
      ? mesh.userData.island.id
      : null;
    if (previousId && islandMeshes.get(previousId) === mesh) islandMeshes.delete(previousId);

    const basePositions = mesh.userData?.streamedIslandBasePositions ?? captureBasePositions(mesh.geometry);
    scene.remove(mesh);
    mesh.visible = false;
    clearStreamedIslandTransition(mesh);
    mesh.userData = { streamedIslandBasePositions: basePositions };
    applyIslandGeology(mesh.geometry, basePositions, island);

    if (!island) {
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      return;
    }

    mesh.position.set(island.x, 0, island.z);
    mesh.scale.set(island.scale, island.height, island.scale);
    mesh.userData = { island, presentationClass: kind, streamedIslandBasePositions: basePositions };
    resetStreamedIslandTransition(mesh, now());
    mesh.visible = true;
    islandMeshes.set(island.id, mesh);
    scene.add(mesh);
  }

  function dispose(mesh) {
    if (!isMeshLike(mesh)) return;
    const id = typeof mesh.userData?.island?.id === 'string' ? mesh.userData.island.id : null;
    if (id && islandMeshes.get(id) === mesh) islandMeshes.delete(id);
    scene.remove(mesh);
    mesh.visible = false;
    clearStreamedIslandTransition(mesh);
    mesh.userData = {};
    mesh.geometry.dispose?.();
    mesh.material.dispose?.();
  }

  return Object.freeze({ create, reset, dispose });
}

export const streamedIslandThreeAdapterInternals = Object.freeze({
  COLORS,
  isMeshLike,
  cameraDistance,
  captureBasePositions,
  applyIslandGeology,
});
