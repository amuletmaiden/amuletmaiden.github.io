import assert from 'node:assert/strict';
import {
  createVerticalWeatherVaporState,
  stepVerticalWeatherVapor,
  verticalWeatherVaporPresentation,
  verticalWeatherVaporPublicState,
} from '../src/core/vertical-weather-vapor.js';

const frame = (overrides = {}) => Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  speed: 72,
  now: 1000,
  position: Object.freeze({ x: 0, y: 500, z: 0 }),
  weather: Object.freeze({ active: true, layer: 'mist' }),
  ...overrides,
});

let state = createVerticalWeatherVaporState();
assert.deepEqual(verticalWeatherVaporPublicState(state), { active: false, vaporClass: null });

state = stepVerticalWeatherVapor({ state, frame: frame() });
assert.equal(state.active, true);
assert.equal(state.vaporClass, 'mist');
assert.equal(state.history.length, 1);

const hover = stepVerticalWeatherVapor({
  state,
  frame: frame({ now: 1100, position: { x: 4, y: 500, z: 3 } }),
});
assert.equal(hover.history.length, 1, 'tiny movement must not accumulate vapor history');

let moving = hover;
for (let index = 1; index <= 9; index += 1) {
  moving = stepVerticalWeatherVapor({
    state: moving,
    frame: frame({ now: 1100 + index * 80, position: { x: index * 18, y: 500, z: 0 } }),
  });
}
assert.equal(moving.history.length, 6, 'history must remain tightly capped');

const low = stepVerticalWeatherVapor({
  state: moving,
  frame: frame({ now: 2000, position: { x: 190, y: 340, z: 0 }, weather: { active: true, layer: 'low' } }),
});
assert.equal(low.vaporClass, 'low');
assert.equal(low.history.length, 1, 'weather class transition should start a fresh local trace');
const lowPresentation = verticalWeatherVaporPresentation(low);
assert.ok(lowPresentation.opacity > 0);
assert.ok(lowPresentation.scale > 1);

const cloudbreak = stepVerticalWeatherVapor({
  state: low,
  frame: frame({ now: 2100, position: { x: 210, y: 980, z: 0 }, weather: { active: true, layer: 'break' } }),
});
assert.equal(cloudbreak.vaporClass, 'break');
assert.ok(verticalWeatherVaporPresentation(cloudbreak).scale < 1);

const clear = stepVerticalWeatherVapor({
  state: cloudbreak,
  frame: frame({ now: 2200, weather: { active: true, layer: 'clear' } }),
});
assert.deepEqual(verticalWeatherVaporPublicState(clear), { active: false, vaporClass: null });
assert.equal(clear.history.length, 0, 'clear air should shed retained mist immediately');

for (const interrupted of [
  frame({ paused: true }),
  frame({ airborne: false }),
  frame({ recoveryActive: true }),
  frame({ restorePublishing: true }),
  frame({ ready: false }),
  frame({ speed: 20 }),
  frame({ speed: Number.NaN }),
  frame({ now: Number.NaN }),
  frame({ position: { x: Number.NaN, y: 1, z: 2 } }),
  frame({ weather: { active: false, layer: 'mist' } }),
  frame({ weather: { active: true, layer: 'unknown' } }),
]) {
  const reset = stepVerticalWeatherVapor({ state: moving, frame: interrupted });
  assert.deepEqual(verticalWeatherVaporPublicState(reset), { active: false, vaporClass: null });
  assert.equal(reset.history.length, 0);
}

let reduced = createVerticalWeatherVaporState();
for (let index = 0; index < 4; index += 1) {
  reduced = stepVerticalWeatherVapor({
    state: reduced,
    frame: frame({ now: 3000 + index * 100, position: { x: index * 20, y: 500, z: 0 } }),
    reducedMotion: true,
  });
}
assert.equal(reduced.history.length, 1, 'reduced motion should contract temporal history to the current trace');

const normalPresentation = verticalWeatherVaporPresentation(state);
const contrastPresentation = verticalWeatherVaporPresentation(state, { highContrast: true });
assert.equal(normalPresentation.active, contrastPresentation.active);
assert.equal(normalPresentation.vaporClass, contrastPresentation.vaporClass);
assert.ok(contrastPresentation.opacity >= normalPresentation.opacity);

const privateLooking = Object.freeze({
  ...state,
  regionId: 'hidden-region',
  altitude: 500,
  speed: 72,
  thresholds: { cloudline: 1000 },
});
const publicState = verticalWeatherVaporPublicState(privateLooking);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'vaporClass']);
assert.equal(JSON.stringify(publicState).includes('hidden-region'), false);
assert.equal(JSON.stringify(publicState).includes('1000'), false);

const caller = frame();
const before = JSON.stringify(caller);
stepVerticalWeatherVapor({ state, frame: caller });
assert.equal(JSON.stringify(caller), before);

console.log('vertical-weather-vapor regressions: ok');
