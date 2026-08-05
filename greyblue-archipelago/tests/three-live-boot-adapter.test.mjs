import assert from 'node:assert/strict';
import {
  createMinimalDragon,
  createMinimalIsle,
  startThreeLiveBoot,
} from '../src/core/three-live-boot-adapter.js';

class Node {
  constructor() {
    this.children = [];
    this.userData = {};
    this.position = { set() {} };
    this.rotation = { set() {} };
    this.scale = { set() {}, setScalar() {} };
  }
  add(...children) { this.children.push(...children); }
}
class Group extends Node {}
class Mesh extends Node {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
class Geometry {}
class Material { constructor(options) { this.options = options; } }
const THREE = {
  Group,
  Mesh,
  ConeGeometry: Geometry,
  BoxGeometry: Geometry,
  SphereGeometry: Geometry,
  MeshStandardMaterial: Material,
};

function sceneHarness() {
  const children = [];
  return {
    children,
    add(node) { children.push(node); },
    remove(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
    },
  };
}

{
  const dragon = createMinimalDragon(THREE);
  assert.equal(dragon.userData.greyblueFallback, true);
  assert.equal(dragon.userData.greyblueKind, 'dragon');
  assert.equal(dragon.children.length, 4);
}

{
  const isle = createMinimalIsle(THREE);
  assert.equal(isle.userData.greyblueFallback, true);
  assert.equal(isle.userData.greyblueKind, 'isle');
  assert.equal(isle.children.length, 2);
}

{
  const scene = sceneHarness();
  const stateTarget = {};
  const result = await startThreeLiveBoot({
    THREE,
    scene,
    stateTarget,
    saveSchema: 2,
    loadDragon: async () => ({ scene: new Group(), animations: [] }),
    loadIsle: async () => ({ scene: new Group(), animations: [] }),
  });
  assert.equal(result.playable, true);
  assert.equal(result.mode, 'released');
  assert.equal(scene.children.length, 2);
  assert.equal(stateTarget.boot.playable, true);
  assert.equal(stateTarget.boot.dragonSource, 'released');
  assert.equal(stateTarget.boot.isleSource, 'released');
}

{
  const scene = sceneHarness();
  const result = await startThreeLiveBoot({
    THREE,
    scene,
    saveSchema: 2,
    loadDragon: async () => { throw new Error('missing'); },
    loadIsle: async () => ({ scene: new Group(), animations: [] }),
  });
  assert.equal(result.playable, true);
  assert.equal(result.mode, 'minimal-playable');
  assert.equal(result.boot.dragonSource, 'fallback');
  assert.equal(result.boot.isleSource, 'released');
  assert.equal(scene.children.length, 2);
}

{
  const stateTarget = {};
  const result = await startThreeLiveBoot({ THREE: {}, scene: sceneHarness(), stateTarget });
  assert.equal(result.playable, false);
  assert.equal(result.mode, 'blocked');
  assert.ok(result.boot.failureCodes.includes('three:Group-missing'));
  assert.deepEqual(stateTarget.boot, result.boot);
}

{
  const scene = sceneHarness();
  let dragonAttached = false;
  const result = await startThreeLiveBoot({
    THREE,
    scene,
    saveSchema: 2,
    loadDragon: async () => ({ scene: new Group(), animations: [] }),
    loadIsle: async () => ({ scene: new Group(), animations: [] }),
    onDragon() {
      dragonAttached = true;
      throw new Error('consumer failed');
    },
  });
  assert.equal(dragonAttached, true);
  assert.equal(result.playable, false);
  assert.equal(scene.children.length, 0);
  assert.ok(result.boot.failureCodes.includes('runtime:dragon-attach-failed'));
}

console.log('three-live-boot-adapter: ok');
