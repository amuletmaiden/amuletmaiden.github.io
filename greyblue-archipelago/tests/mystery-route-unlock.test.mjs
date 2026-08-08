import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMysteryRouteUnlocks } from '../src/core/mystery-route-unlock.js';

function worldFixture() {
  return {
    regions: [
      { id: 'north' },
      { id: 'south' },
    ],
    islands: [
      { id: 'n0', regionId: 'north', landmarkRecord: { id: 'n0:landmark' } },
      { id: 'n1', regionId: 'north', landmarkRecord: { id: 'n1:landmark' } },
      { id: 's0', regionId: 'south', landmarkRecord: { id: 's0:landmark' } },
      { id: 's1', regionId: 'south' },
    ],
    routes: [
      { id: 'route:ring:0', kind: 'far-ring', fromIslandId: 'n0', toIslandId: 's0' },
      { id: 'route:north:0', kind: 'regional-chain', fromIslandId: 'n0', toIslandId: 'n1' },
    ],
  };
}

function exploration(events) {
  return { version: 1, events };
}

function investigated(id, regionId) {
  return { kind: 'landmark-investigated', id, landmarkId: id, regionId, occurredAt: 1 };
}

test('requires two distinct investigations when two authored landmarks exist', () => {
  const one = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([investigated('n0:landmark', 'north')]),
    discoveredIslandIds: ['n0', 's0'],
  });
  assert.equal(one.unlocks.length, 0);
  assert.deepEqual(one.regionProgress.find((entry) => entry.regionId === 'north'), {
    regionId: 'north', investigated: 1, required: 2, ready: false,
  });

  const two = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([
      investigated('n0:landmark', 'north'),
      investigated('n1:landmark', 'north'),
    ]),
    discoveredIslandIds: ['n0', 's0'],
  });
  assert.deepEqual(two.unlocks.map((entry) => entry.routeId), ['route:ring:0']);
});

test('sparse one-landmark regions use the available authored count', () => {
  const result = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([investigated('s0:landmark', 'south')]),
    discoveredIslandIds: ['n0', 's0'],
  });
  assert.equal(result.regionProgress.find((entry) => entry.regionId === 'south')?.required, 1);
  assert.deepEqual(result.unlocks.map((entry) => entry.routeId), ['route:ring:0']);
});

test('never unlocks a route whose destination endpoint is undiscovered', () => {
  const result = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([
      investigated('n0:landmark', 'north'),
      investigated('n1:landmark', 'north'),
    ]),
    discoveredIslandIds: ['n0'],
  });
  assert.equal(result.unlocks.length, 0);
});

test('does not re-unlock already discovered routes', () => {
  const result = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([
      investigated('n0:landmark', 'north'),
      investigated('n1:landmark', 'north'),
    ]),
    discoveredIslandIds: ['n0', 's0'],
    discoveredRouteIds: ['route:ring:0'],
  });
  assert.equal(result.unlocks.length, 0);
});

test('accepts a truthful live investigation before the persistence flush is observed', () => {
  const result = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([investigated('n0:landmark', 'north')]),
    discoveredIslandIds: ['n0', 's0'],
    liveInvestigation: { landmarkId: 'n1:landmark', regionId: 'north' },
  });
  assert.deepEqual(result.unlocks.map((entry) => entry.routeId), ['route:ring:0']);
  assert.equal(result.investigationCount, 2);
});

test('dedupes repeated investigations and ignores unknown authored landmark IDs', () => {
  const result = evaluateMysteryRouteUnlocks({
    world: worldFixture(),
    exploration: exploration([
      investigated('n0:landmark', 'north'),
      investigated('n0:landmark', 'north'),
      investigated('made-up', 'north'),
    ]),
    discoveredIslandIds: ['n0', 's0'],
  });
  assert.equal(result.unlocks.length, 0);
  assert.equal(result.regionProgress.find((entry) => entry.regionId === 'north')?.investigated, 1);
});

test('malformed inputs fail closed without mutating callers', () => {
  const source = worldFixture();
  const before = JSON.stringify(source);
  const result = evaluateMysteryRouteUnlocks({
    world: source,
    exploration: { events: [null, {}, { kind: 'landmark-investigated', id: 7 }] },
    discoveredIslandIds: [null, 7],
    discoveredRouteIds: 'bad',
  });
  assert.equal(result.unlocks.length, 0);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.unlocks), true);
});
