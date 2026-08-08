import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamedIslandThreeAdapter } from '../src/core/streamed-island-three-adapter.js';

class FakeGeometry {
  translate() {}
  dispose() {}
}

class FakeMaterial {
  constructor(options) {
    this.options = { ...options };
    this.opacity = 1;
    this.transparent = false;
  }
  dispose() {}
}

function vector() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = vector();
    this.scale = vector();
    this.userData = {};
    this.visible = false;
  }
}

function harness({ reduced = false } = {}) {
  let clock = 100;
  const scene = {
    fog: { density: 0.00042 },
    add() {},
    remove() {},
  };
  const islandMeshes = new Map();
  const adapter = createStreamedIslandThreeAdapter({
    THREE: { ConeGeometry: FakeGeometry, MeshStandardMaterial: FakeMaterial, Mesh: FakeMesh },
    scene,
    islandMeshes,
    now: () => clock,
    reducedMotion: () => reduced,
  });
  return {
    adapter,
    scene,
    islandMeshes,
    setNow(value) { clock = value; },
  };
}

test('pooled island reveal is applied by the existing render callback', () => {
  const { adapter, scene, setNow } = harness();
  const mesh = adapter.create('ordinary');
  adapter.reset(mesh, { id: 'mist-a', x: 500, z: 0, scale: 1, height: 90 }, 'ordinary');
  assert.equal(mesh.material.opacity, 0);

  setNow(190);
  mesh.onBeforeRender(null, scene, { position: { x: 0, z: 0 } });
  const early = mesh.material.opacity;
  assert.ok(early >= 0 && early <= 1);
  assert.equal(mesh.userData.streamTransition.transitioning, true);

  setNow(1000);
  mesh.onBeforeRender(null, scene, { position: { x: 0, z: 0 } });
  assert.ok(mesh.material.opacity >= early);
  assert.equal(mesh.userData.streamTransition.transitioning, false);
});

test('reduced motion resolves the render handoff immediately', () => {
  const { adapter, scene } = harness({ reduced: true });
  const mesh = adapter.create('landmark');
  adapter.reset(mesh, { id: 'mist-b', x: 500, z: 0, scale: 1, height: 90, landmark: true }, 'landmark');
  mesh.onBeforeRender(null, scene, { position: { x: 0, z: 0 } });
  assert.equal(mesh.userData.streamTransition.transitioning, false);
  assert.ok(mesh.material.opacity >= 0 && mesh.material.opacity <= 1);
});

test('release and reuse cannot inherit transition age or opacity', () => {
  const { adapter, scene, setNow } = harness();
  const mesh = adapter.create('ordinary');
  adapter.reset(mesh, { id: 'first', x: 500, z: 0, scale: 1, height: 90 }, 'ordinary');
  setNow(1000);
  mesh.onBeforeRender(null, scene, { position: { x: 0, z: 0 } });
  assert.ok(mesh.material.opacity > 0);

  adapter.reset(mesh, null, 'ordinary');
  assert.equal(mesh.material.opacity, 1);
  assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.userData.streamTransition, undefined);

  setNow(1400);
  adapter.reset(mesh, { id: 'second', x: 300, z: 0, scale: 1, height: 100 }, 'ordinary');
  assert.equal(mesh.material.opacity, 0);
  assert.equal(mesh.userData.streamTransition.activatedAtMs, 1400);
  assert.equal(mesh.userData.island.id, 'second');
});
