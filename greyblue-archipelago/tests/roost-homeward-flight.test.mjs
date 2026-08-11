import assert from 'node:assert/strict';
import {
  completeRoostHomewardFlight,
  createRoostHomewardFlightState,
  roostHomewardFlightPublicState,
  stepRoostHomewardFlight,
} from '../src/core/roost-homeward-flight.js';

const target = Object.freeze({
  islandId: 'isle-home',
  zoneId: 'roost-a',
  regionId: 'region-a',
  center: Object.freeze({ x: 0, y: 10, z: 0 }),
  radius: 40,
});

function frame(x, z = 0, overrides = {}) {
  return {
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    crossingActive: false,
    restorePublishing: false,
    regionId: 'region-a',
    position: { x, y: 70, z },
    ...overrides,
  };
}

let state = createRoostHomewardFlightState();
state = stepRoostHomewardFlight({ state, target, frame: frame(80) });
assert.equal(state.phase, 'depart');
assert.equal(state.active, false);

const spawnedAway = stepRoostHomewardFlight({ state: createRoostHomewardFlightState(), target, frame: frame(500) });
assert.deepEqual(roostHomewardFlightPublicState(spawnedAway), {
  available: false,
  active: false,
  phase: null,
  completed: false,
});

state = stepRoostHomewardFlight({ state, target, frame: frame(190) });
assert.equal(state.phase, 'homeward');
assert.equal(state.active, true);

const jitter = stepRoostHomewardFlight({ state, target, frame: frame(195) });
assert.equal(jitter.closingTravel, 0);

state = stepRoostHomewardFlight({ state, target, frame: frame(430) });
assert.equal(state.active, true);
assert.equal(state.phase, 'homeward');

state = stepRoostHomewardFlight({ state, target, frame: frame(260) });
assert.equal(state.closingTravel > 0, true);
state = stepRoostHomewardFlight({ state, target, frame: frame(120) });
assert.equal(state.closingTravel >= 260, true);
assert.equal(state.phase, 'settle');

const wrongRest = completeRoostHomewardFlight({
  state,
  restEvent: { beganRest: true, islandId: 'other', zoneId: 'roost-a' },
});
assert.equal(wrongRest.completed, false);
assert.equal(wrongRest.active, false);

const completed = completeRoostHomewardFlight({
  state,
  restEvent: { beganRest: true, islandId: 'isle-home', zoneId: 'roost-a' },
});
assert.deepEqual(roostHomewardFlightPublicState(completed), {
  available: true,
  active: false,
  phase: 'settle',
  completed: true,
});

for (const overrides of [
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
  { regionId: 'region-b' },
  { position: { x: NaN, y: 1, z: 1 } },
]) {
  const reset = stepRoostHomewardFlight({ state, target, frame: frame(150, 0, overrides) });
  assert.equal(reset.active, false);
  assert.equal(reset.completed, false);
}

const teleported = stepRoostHomewardFlight({ state, target, frame: frame(-600) });
assert.equal(teleported.active, false);

const publicState = roostHomewardFlightPublicState({
  ...state,
  target: { secret: 'hidden' },
  closingTravel: 9999,
  coordinates: { x: 1, y: 2, z: 3 },
});
assert.deepEqual(Object.keys(publicState), ['available', 'active', 'phase', 'completed']);

console.log('roost-homeward-flight: ok');
