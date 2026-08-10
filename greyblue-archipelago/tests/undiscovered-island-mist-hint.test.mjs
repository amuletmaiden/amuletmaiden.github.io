import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveUndiscoveredIslandMistHint,
  undiscoveredIslandMistHintPublicState,
} from '../src/core/undiscovered-island-mist-hint.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'known', regionId: 'reach', x: 450, z: 0, discovery: Object.freeze({ threshold: 160 }) }),
    Object.freeze({ id: 'near-unknown', regionId: 'reach', x: 650, z: 0, discovery: Object.freeze({ threshold: 180 }) }),
    Object.freeze({ id: 'far-unknown', regionId: 'reach', x: 1200, z: 0, discovery: Object.freeze({ threshold: 180 }) }),
    Object.freeze({ id: 'other-region', regionId: 'crown', x: 500, z: 0, discovery: Object.freeze({ threshold: 180 }) }),
  ]),
});

function derive(patch = {}) {
  return deriveUndiscoveredIslandMistHint({
    world,
    currentRegionId: 'reach',
    discoveredIslandIds: ['known'],
    position: { x: 0, z: 0 },
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    ...patch,
  });
}

test('selects nearest eligible undiscovered island in current region', () => {
  const result = derive();
  assert.equal(result.active, true);
  assert.equal(result.hintClass, 'near');
  assert.deepEqual(result.relative, { x: 650, z: 0 });
  assert.equal(result.distance, 650);
});

test('excludes discovered and wrong-region candidates', () => {
  const result = derive({ discoveredIslandIds: ['known', 'near-unknown'] });
  assert.equal(result.active, true);
  assert.equal(result.hintClass, 'faint');
  assert.deepEqual(result.relative, { x: 1200, z: 0 });
});

test('does not hint once ordinary discovery proximity should be authoritative', () => {
  const result = derive({ position: { x: 300, z: 0 } });
  assert.equal(result.active, true);
  assert.equal(result.hintClass, 'faint');
  assert.deepEqual(result.relative, { x: 900, z: 0 });
});

test('interruptions and malformed position fail closed', () => {
  for (const patch of [
    { ready: false },
    { paused: true },
    { airborne: false },
    { recoveryActive: true },
    { restorePublishing: true },
    { crossingActive: true },
    { position: { x: NaN, z: 0 } },
  ]) {
    assert.deepEqual(undiscoveredIslandMistHintPublicState(derive(patch)), { active: false, hintClass: null });
  }
});

test('public state strips hidden direction, distance and world identity', () => {
  const result = derive();
  assert.deepEqual(undiscoveredIslandMistHintPublicState({ ...result, islandId: 'hidden' }), { active: true, hintClass: 'near' });
  assert.deepEqual(Object.keys(undiscoveredIslandMistHintPublicState(result)), ['active', 'hintClass']);
});

test('caller world and discovery inputs remain unchanged', () => {
  const discovered = ['known'];
  const before = structuredClone(discovered);
  derive({ discoveredIslandIds: discovered });
  assert.deepEqual(discovered, before);
  assert.equal(world.islands[1].x, 650);
});
