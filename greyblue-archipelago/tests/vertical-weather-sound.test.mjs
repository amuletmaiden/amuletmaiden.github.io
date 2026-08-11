import assert from 'node:assert/strict';
import {
  composeVerticalWeatherSoundTargets,
  createVerticalWeatherSoundState,
  stepVerticalWeatherSound,
  verticalWeatherSoundMix,
  verticalWeatherSoundPublicState,
} from '../src/core/vertical-weather-sound.js';

const frame = (overrides = {}) => Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  altitude: 600,
  speed: 72,
  cloudline: 1000,
  fogDensity: 0.00036,
  ...overrides,
});

let state = createVerticalWeatherSoundState();
assert.deepEqual(verticalWeatherSoundPublicState(state), { active: false, layer: 'mist' });
assert.deepEqual(verticalWeatherSoundMix(state), {
  windGainMultiplier: 1,
  windCutoffMultiplier: 1,
  aerodynamicGainMultiplier: 1,
});

state = stepVerticalWeatherSound({ state, frame: frame({ altitude: 300 }) });
assert.equal(state.layer, 'low');
assert.ok(state.windCutoffMultiplier < 1);
const lowTargets = composeVerticalWeatherSoundTargets({ windGain: 0.3, windCutoff: 1200, aerodynamicGain: 0.08 }, state);
assert.ok(lowTargets.windGain < 0.3);
assert.ok(lowTargets.windCutoff < 1200);
assert.ok(lowTargets.aerodynamicGain < 0.08);

state = stepVerticalWeatherSound({ state, frame: frame({ altitude: 600 }) });
assert.equal(state.layer, 'mist');

state = stepVerticalWeatherSound({ state, frame: frame({ altitude: 960 }) });
assert.equal(state.layer, 'break');
assert.ok(state.windCutoffMultiplier > 1);

state = stepVerticalWeatherSound({ state, frame: frame({ altitude: 1070 }) });
assert.equal(state.layer, 'clear');
assert.ok(state.windGainMultiplier > 1);
assert.ok(state.aerodynamicGainMultiplier > 1);
const clearTargets = composeVerticalWeatherSoundTargets({ windGain: 0.3, windCutoff: 1200, aerodynamicGain: 0.08 }, state);
assert.ok(clearTargets.windGain > 0.3);
assert.ok(clearTargets.windCutoff > 1200);
assert.ok(clearTargets.aerodynamicGain > 0.08);

const clearStable = stepVerticalWeatherSound({ state, frame: frame({ altitude: 1030 }) });
assert.equal(clearStable.layer, 'clear', 'clear-air hysteresis should reject small boundary bobbing');

const breakOnDescent = stepVerticalWeatherSound({ state: clearStable, frame: frame({ altitude: 990 }) });
assert.equal(breakOnDescent.layer, 'break');

const breakStable = stepVerticalWeatherSound({ state: breakOnDescent, frame: frame({ altitude: 940 }) });
assert.equal(breakStable.layer, 'break', 'cloudline mix should not chatter near the lower boundary');

for (const interrupted of [
  frame({ ready: false }),
  frame({ paused: true }),
  frame({ airborne: false }),
  frame({ recoveryActive: true }),
  frame({ restorePublishing: true }),
  frame({ altitude: Number.NaN }),
  frame({ speed: Number.NaN }),
  frame({ cloudline: null }),
  frame({ fogDensity: Number.NaN }),
]) {
  const neutral = stepVerticalWeatherSound({ state: clearStable, frame: interrupted });
  assert.deepEqual(verticalWeatherSoundPublicState(neutral), { active: false, layer: 'mist' });
  assert.deepEqual(verticalWeatherSoundMix(neutral), {
    windGainMultiplier: 1,
    windCutoffMultiplier: 1,
    aerodynamicGainMultiplier: 1,
  });
  assert.deepEqual(
    composeVerticalWeatherSoundTargets({ windGain: 0.3, windCutoff: 1200, aerodynamicGain: 0.08 }, neutral),
    { windGain: 0.3, windCutoff: 1200, aerodynamicGain: 0.08 },
  );
}

const privateLooking = Object.freeze({
  ...clearStable,
  regionId: 'secret-region',
  cloudline: 1000,
  altitude: 1100,
  coordinates: { x: 1, y: 2, z: 3 },
});
const publicState = verticalWeatherSoundPublicState(privateLooking);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'layer']);
assert.equal(JSON.stringify(publicState).includes('secret-region'), false);
assert.equal(JSON.stringify(publicState).includes('1000'), false);
assert.equal(JSON.stringify(publicState).includes('1100'), false);

const caller = frame({ altitude: 1100 });
const before = JSON.stringify(caller);
stepVerticalWeatherSound({ state, frame: caller });
assert.equal(JSON.stringify(caller), before);

const baseTargets = Object.freeze({ windGain: 0.3, windCutoff: 1200, aerodynamicGain: 0.08 });
const baseBefore = JSON.stringify(baseTargets);
composeVerticalWeatherSoundTargets(baseTargets, clearStable);
assert.equal(JSON.stringify(baseTargets), baseBefore);

const boundedTargets = composeVerticalWeatherSoundTargets(
  { windGain: 100, windCutoff: 100000, aerodynamicGain: 100 },
  clearStable,
);
assert.deepEqual(boundedTargets, { windGain: 1, windCutoff: 18000, aerodynamicGain: 0.3 });

console.log('vertical-weather-sound regressions: ok');
