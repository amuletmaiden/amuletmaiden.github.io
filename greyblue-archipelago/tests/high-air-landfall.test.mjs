import assert from 'node:assert/strict';
import {
  advanceHighAirLandfall,
  createHighAirLandfallState,
  highAirLandfallPublicState,
} from '../src/core/high-air-landfall.js';

const anchor = Object.freeze({
  id: 'island-b',
  regionId: 'region-b',
  x: 1000,
  z: 500,
  landingZones: Object.freeze([
    Object.freeze({ x: 1010, y: 40, z: 510, radius: 80 }),
  ]),
});

const base = Object.freeze({
  highAirCrossingCompleted: true,
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  crossingActive: false,
  currentRegionId: 'region-b',
  thinningHeight: 900,
  anchorIsland: anchor,
  discoveredIslandIds: Object.freeze(['island-b']),
  position: Object.freeze({ x: 0, y: 950, z: 0 }),
  precisionTouchdownCompleted: false,
});

let state = advanceHighAirLandfall(createHighAirLandfallState(), base);
assert.equal(state.active, true);
assert.equal(state.phase, 'descent');
assert.equal(state.anchorIslandId, 'island-b');

const hidden = advanceHighAirLandfall(createHighAirLandfallState(), {
  ...base,
  discoveredIslandIds: [],
});
assert.equal(hidden.active, false);
assert.equal(hidden.available, false);

const spawnedLow = advanceHighAirLandfall(createHighAirLandfallState(), {
  ...base,
  position: { x: 0, y: 780, z: 0 },
});
assert.equal(spawnedLow.active, false);

const falseArm = advanceHighAirLandfall(createHighAirLandfallState(), {
  ...base,
  highAirCrossingCompleted: false,
});
assert.equal(falseArm.active, false);

state = advanceHighAirLandfall(state, {
  ...base,
  highAirCrossingCompleted: false,
  position: { x: 12, y: 805, z: 0 },
});
assert.equal(state.phase, 'approach');
assert.equal(state.descended, true);
assert.equal(state.approachTravel, 0);

for (let index = 1; index <= 5; index += 1) {
  state = advanceHighAirLandfall(state, {
    ...base,
    highAirCrossingCompleted: false,
    position: { x: index * 70, y: 790, z: index * 10 },
  });
}
assert.ok(state.approachTravel >= 260);
assert.equal(state.phase, 'approach');

const premature = advanceHighAirLandfall(
  advanceHighAirLandfall(createHighAirLandfallState(), base),
  {
    ...base,
    highAirCrossingCompleted: false,
    airborne: false,
    precisionTouchdownCompleted: true,
    position: { x: 1010, y: 40, z: 510 },
    landedPosition: { x: 1010, y: 40, z: 510 },
  },
);
assert.equal(premature.completed, false);
assert.equal(premature.active, false);

const offShelf = advanceHighAirLandfall(state, {
  ...base,
  highAirCrossingCompleted: false,
  airborne: false,
  precisionTouchdownCompleted: true,
  position: { x: 1400, y: 40, z: 900 },
  landedPosition: { x: 1400, y: 40, z: 900 },
});
assert.equal(offShelf.completed, false);

const wrongRegion = advanceHighAirLandfall(state, {
  ...base,
  highAirCrossingCompleted: false,
  currentRegionId: 'region-c',
  anchorIsland: { ...anchor, regionId: 'region-c' },
});
assert.equal(wrongRegion.active, false);

state = advanceHighAirLandfall(state, {
  ...base,
  highAirCrossingCompleted: false,
  airborne: false,
  precisionTouchdownCompleted: true,
  position: { x: 1010, y: 40, z: 510 },
  landedPosition: { x: 1010, y: 40, z: 510 },
});
assert.equal(state.completed, true);
assert.equal(state.phase, 'settle');

const publicState = highAirLandfallPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
assert.equal('anchorIslandId' in publicState, false);
assert.equal('regionId' in publicState, false);
assert.equal('approachTravel' in publicState, false);

const duplicate = advanceHighAirLandfall(state, { paused: true });
assert.equal(duplicate, state);

const interrupted = advanceHighAirLandfall(
  advanceHighAirLandfall(createHighAirLandfallState(), base),
  { ...base, paused: true },
);
assert.equal(interrupted.active, false);

assert.equal(anchor.x, 1000);
assert.equal(base.position.y, 950);
console.log('high-air-landfall regressions: ok');
