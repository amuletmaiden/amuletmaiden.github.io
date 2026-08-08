const COLORS = Object.freeze({ ordinary: 0x536e64, landmark: 0x607f74 });

function isMeshLike(value) {
  return Boolean(value && value.position && value.scale && value.userData && value.geometry && value.material);
}

export function createStreamedIslandThreeAdapter({ THREE, scene, islandMeshes } = {}) {
  if (!THREE?.ConeGeometry || !THREE?.MeshStandardMaterial || !THREE?.Mesh) {
    throw new TypeError('streamed island Three adapter requires THREE geometry/material/mesh constructors');
  }
  if (!scene || typeof scene.add !== 'function' || typeof scene.remove !== 'function') {
    throw new TypeError('streamed island Three adapter requires a scene');
  }
  if (!(islandMeshes instanceof Map)) {
    throw new TypeError('streamed island Three adapter requires islandMeshes Map');
  }

  function create(kind) {
    const geometry = new THREE.ConeGeometry(110, 1, 9, 3);
    geometry.translate(0, -0.42, 0);
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
    return mesh;
  }

  function reset(mesh, island, kind) {
    if (!isMeshLike(mesh)) return;

    const previousId = typeof mesh.userData?.island?.id === 'string'
      ? mesh.userData.island.id
      : null;
    if (previousId && islandMeshes.get(previousId) === mesh) islandMeshes.delete(previousId);

    scene.remove(mesh);
    mesh.visible = false;
    mesh.userData = {};

    if (!island) {
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      return;
    }

    mesh.position.set(island.x, 0, island.z);
    mesh.scale.set(island.scale, island.height, island.scale);
    mesh.userData = { island, presentationClass: kind };
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
    mesh.userData = {};
    mesh.geometry.dispose?.();
    mesh.material.dispose?.();
  }

  return Object.freeze({ create, reset, dispose });
}

export const streamedIslandThreeAdapterInternals = Object.freeze({ COLORS, isMeshLike });
