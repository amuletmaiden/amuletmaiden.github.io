import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKnownVoyageStreamingContinuity,
  publicKnownVoyageStreamingContinuity,
} from '../src/core/known-voyage-streaming-continuity.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'known-near', x: 2500, z: 0, regionId: 'mist' }),
    Object.freeze({ id: 'known-active', x: 3200, z: 0, regionId: 'mist' }),
    Object.freeze({ id: 'known-other-region', x: 3200, z: 30, regionId: 'clear' }),
    Object.freeze({ id: 'unknown-near', x: 2600, z: 0, regionId: 'mist' }),
    Object.freeze({ id: 'known-far', x: 5000, z: 0, regionId: 'mist' }),
  ]),
});

const base = Object.freeze({
  world,
  position: Object.freeze({ x: 0, z: 0 }),
  activeIslandIds: Object.freeze(['known-active', 'known-other-region']),
  discoveredIslandIds: Object.freeze(['known-near', 'known-active', 'known-other-region', 'known-far']),
  currentRegionId: 'mist',
  voyageActive: true,
  activateRange: 2400,
  prewarmRange: 3000,
  retainRange: 3400,
});

function derive(overrides = {}) {
  return createKnownVoyageStreamingContinuity({ ...base, ...overrides });
}

test('prewarms only already-known islands just beyond ordinary activation range', () => {
  const result = derive();
  assert.deepEqual(result.prewarmIslandIds, ['known-near']);
  assert.equal(result.prewarmIslandIds.includes('unknown-near'), false);
});

test('retains only active known islands in the current region', () => {
  const result = derive();
  assert.deepEqual(result.retainIslandIds, ['known-active']);
});

test('does not reach indefinitely or convert distant knowledge into residency', () => {
  const result = derive();
  assert.equal(result.prewarmIslandIds.includes('known-far'), false);
  assert.equal(result.retainIslandIds.includes('known-far'), false);
});

test('pause, recovery and restore fail neutral', () => {
  for (const overrides of [{ paused: true }, { recovery: true }, { restorePublishing: true }]) {
    assert.deepEqual(derive(overrides), {
      active: false,
      retainIslandIds: [],
      prewarmIslandIds: [],
    });
  }
});

test('inactive voyage cannot alter residency', () => {
  assert.deepEqual(derive({ voyageActive: false }), {
    active: false,
    retainIslandIds: [],
    prewarmIslandIds: [],
  });
});

test('malformed position and invalid ranges fail neutral', () => {
  assert.equal(derive({ position: { x: NaN, z: 0 } }).active, false);
  assert.equal(derive({ retainRange: 2000 }).active, false);
  assert.equal(derive({ prewarmRange: 1000 }).active, false);
});

test('public state strips all island identity', () => {
  assert.deepEqual(publicKnownVoyageStreamingContinuity(derive()), {
    active: true,
    retaining: true,
    prewarming: true,
  });
});

test('caller world and input arrays are not mutated', () => {
  const activeIslandIds = ['known-active'];
  const discoveredIslandIds = ['known-near', 'known-active'];
  const beforeWorld = JSON.stringify(world);
  const beforeActive = [...activeIslandIds];
  const beforeDiscovered = [...discoveredIslandIds];
  createKnownVoyageStreamingContinuity({
    ...base,
    activeIslandIds,
    discoveredIslandIds,
  });
  assert.equal(JSON.stringify(world), beforeWorld);
  assert.deepEqual(activeIslandIds, beforeActive);
  assert.deepEqual(discoveredIslandIds, beforeDiscovered);
});
