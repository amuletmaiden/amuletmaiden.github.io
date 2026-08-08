import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamedIslandThreeAdapter } from '../src/core/streamed-island-three-adapter.js';

class FakeGeometry {
  constructor(...args) { this.args = args; this.translated = null; this.disposed = 0; }
  translate(...args) { this.translated = args; }
  dispose() { this.disposed += 1; }
}

class FakeMaterial {
  constructor(options) { this.options = { ...options }; this.disposed = 0; }
  dispose() { this.disposed += 1; }
}

function vector() {
  return {
    values: [0, 0, 0],
    set(x, y, z) { this.values = [x, y, z]; },
  };
}

class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = vector();
    this.scale = vector();
    this.userData = {};
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }
}

function harness() {
  const added = [];
  const removed = [];
  const scene = {
    add(mesh) { added.push(mesh); },
    remove(mesh) { removed.push(mesh); },
  };
  const islandMeshes = new Map();
  const adapter = createStreamedIslandThreeAdapter({
    THREE: { ConeGeometry: FakeGeometry, MeshStandardMaterial: FakeMaterial, Mesh: FakeMesh },
    scene,
    islandMeshes,
  });
  return { adapter, islandMeshes, added, removed };
}

test('creates reusable unit geometry and class-specific material once', () => {
  const { adapter } = harness();
  const ordinary = adapter.create('ordinary');
  const landmark = adapter.create('landmark');
  assert.deepEqual(ordinary.geometry.args, [110, 1, 9, 3]);
  assert.deepEqual(ordinary.geometry.translated, [0, -0.42, 0]);
  assert.notEqual(ordinary.material.options.color, landmark.material.options.color);
  assert.equal(ordinary.castShadow, true);
  assert.equal(ordinary.receiveShadow, true);
});

test('reset maps authored size into transforms without reallocating geometry', () => {
  const { adapter, islandMeshes, added } = harness();
  const mesh = adapter.create('ordinary');
  const geometry = mesh.geometry;
  const material = mesh.material;
  const island = { id: 'isle-a', x: 12, z: -9, scale: 1.6, height: 140, landmark: false };
  adapter.reset(mesh, island, 'ordinary');
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  assert.deepEqual(mesh.position.values, [12, 0, -9]);
  assert.deepEqual(mesh.scale.values, [1.6, 140, 1.6]);
  assert.equal(mesh.userData.island, island);
  assert.equal(islandMeshes.get('isle-a'), mesh);
  assert.equal(added.at(-1), mesh);
});

test('release reset clears stale identity, transform, visibility and map entry', () => {
  const { adapter, islandMeshes, removed } = harness();
  const mesh = adapter.create('ordinary');
  adapter.reset(mesh, { id: 'old', x: 90, z: 40, scale: 2, height: 220 }, 'ordinary');
  adapter.reset(mesh, null, 'ordinary');
  assert.equal(islandMeshes.has('old'), false);
  assert.deepEqual(mesh.position.values, [0, 0, 0]);
  assert.deepEqual(mesh.scale.values, [1, 1, 1]);
  assert.deepEqual(mesh.userData, {});
  assert.equal(mesh.visible, false);
  assert.equal(removed.at(-1), mesh);
});

test('reusing one mesh replaces prior island identity without cross-contamination', () => {
  const { adapter, islandMeshes } = harness();
  const mesh = adapter.create('landmark');
  adapter.reset(mesh, { id: 'first', x: 1, z: 2, scale: 1, height: 80 }, 'landmark');
  adapter.reset(mesh, null, 'landmark');
  adapter.reset(mesh, { id: 'second', x: -7, z: 14, scale: 0.8, height: 130 }, 'landmark');
  assert.equal(islandMeshes.has('first'), false);
  assert.equal(islandMeshes.get('second'), mesh);
  assert.equal(mesh.userData.island.id, 'second');
  assert.deepEqual(mesh.position.values, [-7, 0, 14]);
  assert.deepEqual(mesh.scale.values, [0.8, 130, 0.8]);
});

test('dispose detaches presentation and disposes retained GPU resources once per call', () => {
  const { adapter, islandMeshes } = harness();
  const mesh = adapter.create('ordinary');
  adapter.reset(mesh, { id: 'isle-a', x: 0, z: 0, scale: 1, height: 100 }, 'ordinary');
  adapter.dispose(mesh);
  assert.equal(islandMeshes.has('isle-a'), false);
  assert.equal(mesh.visible, false);
  assert.deepEqual(mesh.userData, {});
  assert.equal(mesh.geometry.disposed, 1);
  assert.equal(mesh.material.disposed, 1);
});
