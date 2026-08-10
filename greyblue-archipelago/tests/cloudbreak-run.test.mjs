import assert from 'node:assert/strict';
import {
  advanceCloudbreakRun,
  cloudbreakRunPublicState,
  createCloudbreakRunState,
} from '../src/core/cloudbreak-run.js';

const base = Object.freeze({
  ready: true,
  airborne: true,
  regionId: 'hushed-reach',
  thinningHeight: 920,
  planarSpeed: 30,
});

let state = advanceCloudbreakRun(createCloudbreakRunState(), {
  ...base,
  position: { x: 0, y: 700, z: 0 },
});
assert.deepEqual(cloudbreakRunPublicState(state), { available: true, active: true, phase: 'climb', completed: false });

const spawnAbove = advanceCloudbreakRun(createCloudbreakRunState(), {
  ...base,
  position: { x: 0, y: 980, z: 0 },
});
assert.deepEqual(cloudbreakRunPublicState(spawnAbove), { available: true, active: false, phase: 'climb', completed: false });

state = advanceCloudbreakRun(state, { ...base, position: { x: 20, y: 940, z: 0 } });
assert.equal(state.phase, 'cruise');
assert.equal(state.crossedAbove, true);

const hover = advanceCloudbreakRun(state, { ...base, planarSpeed: 8, position: { x: 25, y: 950, z: 0 } });
assert.equal(hover.highTravel, 0);
assert.equal(hover.phase, 'cruise');

state = advanceCloudbreakRun(state, { ...base, position: { x: 120, y: 960, z: 0 } });
state = advanceCloudbreakRun(state, { ...base, position: { x: 240, y: 970, z: 0 } });
state = advanceCloudbreakRun(state, { ...base, position: { x: 360, y: 965, z: 0 } });
assert.equal(state.phase, 'return');
assert.ok(state.highTravel >= 260);

const stillHigh = advanceCloudbreakRun(state, { ...base, position: { x: 400, y: 850, z: 0 } });
assert.equal(stillHigh.completed, false);
state = advanceCloudbreakRun(stillHigh, { ...base, position: { x: 430, y: 770, z: 0 } });
assert.equal(state.completed, true);
assert.equal(state.active, false);
assert.deepEqual(Object.keys(cloudbreakRunPublicState(state)).sort(), ['active', 'available', 'completed', 'phase']);

let jitter = advanceCloudbreakRun(createCloudbreakRunState(), { ...base, position: { x: 0, y: 890, z: 0 } });
jitter = advanceCloudbreakRun(jitter, { ...base, position: { x: 8, y: 925, z: 0 } });
jitter = advanceCloudbreakRun(jitter, { ...base, position: { x: 12, y: 885, z: 0 } });
assert.equal(jitter.completed, false);
assert.equal(jitter.highTravel, 0);

let fellEarly = advanceCloudbreakRun(createCloudbreakRunState(), { ...base, position: { x: 0, y: 700, z: 0 } });
fellEarly = advanceCloudbreakRun(fellEarly, { ...base, position: { x: 40, y: 940, z: 0 } });
fellEarly = advanceCloudbreakRun(fellEarly, { ...base, position: { x: 80, y: 820, z: 0 } });
assert.equal(fellEarly.active, false);
assert.equal(fellEarly.completed, false);

for (const patch of [
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
  { regionId: 'mothwater' },
  { position: { x: 0, y: NaN, z: 0 } },
]) {
  let attempt = advanceCloudbreakRun(createCloudbreakRunState(), { ...base, position: { x: 0, y: 700, z: 0 } });
  attempt = advanceCloudbreakRun(attempt, { ...base, position: { x: 40, y: 940, z: 0 }, ...patch });
  assert.equal(attempt.active, false);
  assert.equal(attempt.completed, false);
}

const position = { x: 2, y: 700, z: 4 };
advanceCloudbreakRun(createCloudbreakRunState(), { ...base, position });
assert.deepEqual(position, { x: 2, y: 700, z: 4 });

console.log('cloudbreak-run regressions passed');
