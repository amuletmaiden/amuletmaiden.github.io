import assert from 'node:assert/strict';
import {
  deriveMasteredApproachAirLanes,
  masteredApproachAirLanePresentationPolicy,
  masteredApproachAirLanePublicState,
} from '../src/core/mastered-approach-air-lanes.js';

const corridor = Object.freeze({
  id: 'corridor-a',
  entry: Object.freeze({ x: 0, y: 420, z: 1100 }),
  touchdown: Object.freeze({ x: 0, y: 130, z: 0 }),
  width: 110,
  heading: Math.PI,
});
const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'known', regionId: 'r1', approachCorridors: Object.freeze([corridor]) }),
    Object.freeze({
      id: 'hidden', regionId: 'r1',
      approachCorridors: Object.freeze([Object.freeze({
        id: 'secret-corridor', entry: Object.freeze({ x: 80, y: 400, z: 900 }), touchdown: Object.freeze({ x: 80, y: 120, z: 0 }),
      })]),
    }),
  ]),
});

function derive(overrides = {}) {
  return deriveMasteredApproachAirLanes({
    world,
    currentRegionId: 'r1',
    discoveredIslandIds: ['known'],
    masteredCorridorIds: ['corridor-a'],
    position: { x: 100, y: 500, z: 1400 },
    airborne: true,
    ...overrides,
  });
}

{
  const result = derive();
  assert.equal(result.active, true);
  assert.equal(result.lanes.length, 1);
  assert.equal(result.lanes[0].corridorId, 'corridor-a');
  assert.equal(result.lanes[0].trace.length, 5);
  assert.deepEqual(result.lanes[0].trace[0], corridor.entry);
  assert.deepEqual(result.lanes[0].trace.at(-1), corridor.touchdown);
}

{
  assert.deepEqual(derive({ masteredCorridorIds: [] }), { active: false, laneClass: null, lanes: [] });
  assert.deepEqual(derive({ discoveredIslandIds: [] }), { active: false, laneClass: null, lanes: [] });
  assert.deepEqual(derive({ masteredCorridorIds: ['secret-corridor'] }), { active: false, laneClass: null, lanes: [] });
}

{
  const result = derive({ position: { x: 8000, y: 500, z: 8000 } });
  assert.deepEqual(result, { active: false, laneClass: null, lanes: [] });
}

{
  const faint = derive({ position: { x: 1500, y: 500, z: 1400 } });
  const clear = derive({ position: { x: 300, y: 400, z: 700 } });
  const final = derive({ position: { x: 100, y: 230, z: 250 } });
  assert.equal(faint.laneClass, 'faint');
  assert.equal(clear.laneClass, 'clear');
  assert.equal(final.laneClass, 'final');
}

for (const overrides of [
  { airborne: false },
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
  { currentRegionId: 'r2' },
]) {
  assert.deepEqual(derive(overrides), { active: false, laneClass: null, lanes: [] });
}

{
  const normal = derive({ position: { x: 1500, y: 500, z: 1400 } });
  const contrast = derive({ position: { x: 1500, y: 500, z: 1400 }, highContrast: true });
  assert.equal(normal.lanes.length, contrast.lanes.length);
  assert.deepEqual(normal.lanes.map((lane) => lane.corridorId), contrast.lanes.map((lane) => lane.corridorId));
  assert.equal(normal.laneClass, 'faint');
  assert.equal(contrast.laneClass, 'clear');
}

{
  const normal = derive();
  const reduced = derive({ reducedMotion: true });
  assert.deepEqual(
    normal.lanes.map(({ corridorId, laneClass, trace }) => ({ corridorId, laneClass, trace })),
    reduced.lanes.map(({ corridorId, laneClass, trace }) => ({ corridorId, laneClass, trace })),
  );
}

{
  const before = JSON.stringify(world);
  derive();
  assert.equal(JSON.stringify(world), before);
}

{
  for (const laneClass of ['faint', 'clear', 'final']) {
    const normal = masteredApproachAirLanePresentationPolicy(laneClass);
    const contrast = masteredApproachAirLanePresentationPolicy(laneClass, { highContrast: true });
    assert.equal(normal.depthTest, true);
    assert.equal(normal.depthWrite, false);
    assert.equal(normal.fog, true);
    assert.equal(normal.xray, false);
    assert.ok(normal.opacity > 0 && normal.opacity <= 0.56);
    assert.ok(contrast.opacity >= normal.opacity && contrast.opacity <= 0.56);
  }
}

{
  const malformed = deriveMasteredApproachAirLanes({
    world: { islands: [{ id: 'known', regionId: 'r1', approachCorridors: [{ id: 'bad', entry: { x: NaN }, touchdown: {} }] }] },
    currentRegionId: 'r1', discoveredIslandIds: ['known'], masteredCorridorIds: ['bad'], position: { x: 0, y: 300, z: 0 }, airborne: true,
  });
  assert.deepEqual(malformed, { active: false, laneClass: null, lanes: [] });
}

{
  const publicState = masteredApproachAirLanePublicState(derive());
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'laneClass']);
  assert.equal('lanes' in publicState, false);
  assert.equal('corridorId' in publicState, false);
}

console.log('mastered-approach-air-lanes regressions passed');
