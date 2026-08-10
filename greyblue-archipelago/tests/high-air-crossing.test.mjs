import assert from 'node:assert/strict';
import {
  createHighAirCrossingState,
  advanceHighAirCrossing,
  highAirCrossingPublicState,
} from '../src/core/high-air-crossing.js';

const world = Object.freeze({
  regions: Object.freeze([
    Object.freeze({ id: 'a', anchorIslandId: 'ia', adjacentRegionIds: Object.freeze(['b']) }),
    Object.freeze({ id: 'b', anchorIslandId: 'ib', adjacentRegionIds: Object.freeze(['a']) }),
  ]),
  routes: Object.freeze([
    Object.freeze({ kind: 'far-ring', fromRegionId: 'a', toRegionId: 'b' }),
  ]),
});

const cloudbreak = Object.freeze({ active: true, phase: 'cruise' });
const base = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  crossingActive: false,
  currentRegionId: 'a',
  thinningHeight: 900,
  position: Object.freeze({ x: 0, y: 930, z: 0 }),
  planarSpeed: 30,
  cloudbreakState: cloudbreak,
  world,
  discoveredIslandIds: Object.freeze(['ia', 'ib']),
});

let state = createHighAirCrossingState();
state = advanceHighAirCrossing(state, base);
assert.equal(state.active, true);
assert.equal(state.phase, 'depart');
assert.equal(state.targetRegionId, 'b');

let unknown = advanceHighAirCrossing(createHighAirCrossingState(), {
  ...base,
  discoveredIslandIds: ['ia'],
});
assert.equal(unknown.active, false);
assert.equal(unknown.available, false);

let unqualified = advanceHighAirCrossing(createHighAirCrossingState(), {
  ...base,
  cloudbreakState: { active: true, phase: 'climb' },
});
assert.equal(unqualified.active, false);

state = advanceHighAirCrossing(state, { ...base, position: { x: 18, y: 930, z: 0 }, planarSpeed: 40 });
assert.equal(state.travel, 0);

for (let index = 1; index <= 10; index += 1) {
  state = advanceHighAirCrossing(state, {
    ...base,
    position: { x: index * 70, y: 940, z: 0 },
    planarSpeed: 34,
  });
}
assert.equal(state.phase, 'cross');
assert.ok(state.travel >= 620);

const crossingSnapshot = state;
state = advanceHighAirCrossing(state, {
  ...base,
  crossingActive: true,
  position: { x: 760, y: 940, z: 0 },
});
assert.equal(state.travel, crossingSnapshot.travel);
assert.equal(state.completed, false);

const wrong = advanceHighAirCrossing(state, {
  ...base,
  currentRegionId: 'c',
  position: { x: 800, y: 940, z: 0 },
});
assert.equal(wrong.completed, false);
assert.equal(wrong.active, false);

state = advanceHighAirCrossing(state, {
  ...base,
  currentRegionId: 'b',
  position: { x: 900, y: 940, z: 0 },
});
assert.equal(state.completed, true);
assert.equal(state.phase, 'arrive');

const publicState = highAirCrossingPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
assert.equal('targetRegionId' in publicState, false);

const reset = advanceHighAirCrossing(createHighAirCrossingState(), {
  ...base,
  paused: true,
});
assert.equal(reset.active, false);
assert.equal(reset.available, false);

assert.equal(base.position.x, 0);
console.log('high-air-crossing regressions: ok');
