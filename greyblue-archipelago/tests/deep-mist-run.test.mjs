import assert from 'node:assert/strict';
import {
  advanceDeepMistRun,
  createDeepMistRunState,
  deepMistRunPublicState,
} from '../src/core/deep-mist-run.js';

const base = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  crossingActive: false,
  restorePublishing: false,
  currentRegionId: 'hushed-reach',
  thinningHeight: 920,
  speed: 42,
  position: Object.freeze({ x: 0, y: 520, z: 0 }),
});

let state = advanceDeepMistRun(createDeepMistRunState(), base);
assert.equal(state.active, true);
assert.equal(state.phase, 'descend');
assert.equal(state.regionId, 'hushed-reach');

const spawnedDeep = advanceDeepMistRun(createDeepMistRunState(), {
  ...base,
  position: { x: 0, y: 260, z: 0 },
});
assert.equal(spawnedDeep.active, false);

state = advanceDeepMistRun(state, {
  ...base,
  position: { x: 24, y: 320, z: 0 },
});
assert.equal(state.phase, 'thread');
assert.equal(state.travel, 0);

const hover = advanceDeepMistRun(state, {
  ...base,
  position: { x: 25, y: 318, z: 1 },
});
assert.equal(hover.travel, 0);

const slow = advanceDeepMistRun(state, {
  ...base,
  speed: 8,
  position: { x: 90, y: 315, z: 0 },
});
assert.equal(slow.travel, 0);

const teleported = advanceDeepMistRun(state, {
  ...base,
  position: { x: 900, y: 310, z: 0 },
});
assert.equal(teleported.travel, 0);

for (let index = 1; index <= 8; index += 1) {
  state = advanceDeepMistRun(state, {
    ...base,
    position: { x: 24 + index * 82, y: 300 + (index % 2) * 4, z: index * 12 },
  });
}
assert.equal(state.phase, 'climb');
assert.ok(state.travel >= 620);

state = advanceDeepMistRun(state, {
  ...base,
  position: { x: 700, y: 450, z: 100 },
});
assert.equal(state.completed, true);
assert.equal(state.active, false);
assert.equal(state.phase, 'climb');

const duplicate = advanceDeepMistRun(state, { paused: true });
assert.equal(duplicate, state);

const tooSoon = advanceDeepMistRun(
  advanceDeepMistRun(
    advanceDeepMistRun(createDeepMistRunState(), base),
    { ...base, position: { x: 20, y: 320, z: 0 } },
  ),
  { ...base, position: { x: 80, y: 450, z: 0 } },
);
assert.equal(tooSoon.completed, false);
assert.equal(tooSoon.active, false);

for (const frame of [
  { ...base, paused: true },
  { ...base, airborne: false },
  { ...base, recoveryActive: true },
  { ...base, crossingActive: true },
  { ...base, restorePublishing: true },
  { ...base, currentRegionId: '' },
  { ...base, thinningHeight: Number.NaN },
  { ...base, position: { x: Number.NaN, y: 500, z: 0 } },
]) {
  const rejected = advanceDeepMistRun(createDeepMistRunState(), frame);
  assert.equal(rejected.active, false);
}

const wrongRegion = advanceDeepMistRun(
  advanceDeepMistRun(createDeepMistRunState(), base),
  { ...base, currentRegionId: 'mothwater', position: { x: 30, y: 320, z: 0 } },
);
assert.equal(wrongRegion.active, false);

const publicState = deepMistRunPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
assert.equal('regionId' in publicState, false);
assert.equal('entryHeight' in publicState, false);
assert.equal('travel' in publicState, false);
assert.equal(base.position.y, 520);

console.log('deep-mist-run regressions: ok');
