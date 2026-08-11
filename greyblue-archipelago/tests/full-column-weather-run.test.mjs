import assert from 'node:assert/strict';
import {
  advanceFullColumnWeatherRun,
  createFullColumnWeatherRunState,
  fullColumnWeatherRunPublicState,
} from '../src/core/full-column-weather-run.js';

const base = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  crossingActive: false,
  restorePublishing: false,
  currentRegionId: 'hushed-reach',
  position: Object.freeze({ x: 0, y: 460, z: 0 }),
  deepMistCompleted: false,
  cloudbreakCompleted: false,
});

let state = advanceFullColumnWeatherRun(createFullColumnWeatherRunState(), {
  ...base,
  deepMistCompleted: true,
});
assert.equal(state.active, true);
assert.equal(state.phase, 'rise');
assert.equal(state.regionId, 'hushed-reach');

const premature = advanceFullColumnWeatherRun(state, {
  ...base,
  cloudbreakCompleted: true,
  position: { x: 20, y: 500, z: 0 },
});
assert.equal(premature.active, false);
assert.equal(premature.completed, false);

const replayedDeep = advanceFullColumnWeatherRun(state, {
  ...base,
  deepMistCompleted: true,
  position: { x: 40, y: 500, z: 0 },
});
assert.equal(replayedDeep.active, false);

const wrongRegion = advanceFullColumnWeatherRun(state, {
  ...base,
  currentRegionId: 'mothwater',
  position: { x: 40, y: 500, z: 0 },
});
assert.equal(wrongRegion.active, false);

const hover = advanceFullColumnWeatherRun(state, {
  ...base,
  position: { x: 1, y: 460, z: 1 },
});
assert.equal(hover.travel, 0);

const teleported = advanceFullColumnWeatherRun(state, {
  ...base,
  position: { x: 900, y: 700, z: 0 },
});
assert.equal(teleported.travel, 0);

for (let index = 1; index <= 7; index += 1) {
  state = advanceFullColumnWeatherRun(state, {
    ...base,
    position: { x: index * 84, y: 460 + index * 28, z: index * 10 },
  });
}
assert.equal(state.phase, 'clear');
assert.ok(state.travel >= 520);

state = advanceFullColumnWeatherRun(state, {
  ...base,
  cloudbreakCompleted: true,
  position: { x: 620, y: 760, z: 80 },
});
assert.equal(state.completed, true);
assert.equal(state.active, false);
assert.equal(state.phase, 'complete');

const duplicate = advanceFullColumnWeatherRun(state, { paused: true });
assert.equal(duplicate, state);

for (const frame of [
  { ...base, deepMistCompleted: true, paused: true },
  { ...base, deepMistCompleted: true, airborne: false },
  { ...base, deepMistCompleted: true, recoveryActive: true },
  { ...base, deepMistCompleted: true, crossingActive: true },
  { ...base, deepMistCompleted: true, restorePublishing: true },
  { ...base, deepMistCompleted: true, currentRegionId: '' },
  { ...base, deepMistCompleted: true, position: { x: Number.NaN, y: 460, z: 0 } },
]) {
  const rejected = advanceFullColumnWeatherRun(createFullColumnWeatherRunState(), frame);
  assert.equal(rejected.active, false);
}

const backToBack = advanceFullColumnWeatherRun(
  advanceFullColumnWeatherRun(createFullColumnWeatherRunState(), {
    ...base,
    deepMistCompleted: true,
  }),
  {
    ...base,
    cloudbreakCompleted: true,
  },
);
assert.equal(backToBack.completed, false);

const publicState = fullColumnWeatherRunPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
assert.equal('regionId' in publicState, false);
assert.equal('travel' in publicState, false);
assert.equal('lastPosition' in publicState, false);
assert.equal(base.position.x, 0);

console.log('full-column-weather-run regressions: ok');
