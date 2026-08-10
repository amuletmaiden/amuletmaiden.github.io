import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armTouchAndGoLaunch,
  createTouchAndGoLaunchState,
  stepTouchAndGoLaunch,
  touchAndGoLaunchPublicState,
} from '../src/core/touch-and-go-launch.js';

function frame({ x = 0, y = 10, z = 0, airborne = false, speed = 0, verticalSpeed = 0, ...patch } = {}) {
  return {
    ready: true,
    paused: false,
    airborne,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    position: { x, y, z },
    speed,
    verticalSpeed,
    ...patch,
  };
}

function armed() {
  return armTouchAndGoLaunch(createTouchAndGoLaunchState(), { completed: true });
}

test('arms only from truthful precision touchdown completion', () => {
  const initial = createTouchAndGoLaunchState();
  assert.equal(armTouchAndGoLaunch(initial, { completed: false }), initial);
  assert.equal(armTouchAndGoLaunch(initial, null), initial);
  const next = armTouchAndGoLaunch(initial, { completed: true });
  assert.deepEqual(touchAndGoLaunchPublicState(next), {
    available: true,
    active: true,
    phase: 'grounded',
    completed: false,
  });
});

test('requires a truthful grounded hold before takeoff', () => {
  const directAir = stepTouchAndGoLaunch({
    state: armed(),
    frame: frame({ airborne: true, speed: 20, verticalSpeed: 4, y: 15 }),
  });
  assert.deepEqual(touchAndGoLaunchPublicState(directAir), {
    available: false,
    active: false,
    phase: null,
    completed: false,
  });

  let state = armed();
  state = stepTouchAndGoLaunch({ state, frame: frame() });
  state = stepTouchAndGoLaunch({ state, frame: frame() });
  const launched = stepTouchAndGoLaunch({
    state,
    frame: frame({ airborne: true, speed: 18, verticalSpeed: 3, y: 12, x: 8 }),
  });
  assert.equal(launched.active, true);
  assert.equal(launched.phase, 'launch');
});

test('one-frame hops, edge falls, and slow lifts fail closed', () => {
  for (const air of [
    { airborne: true, speed: 8, verticalSpeed: 4, y: 13 },
    { airborne: true, speed: 18, verticalSpeed: -2, y: 8 },
    { airborne: true, speed: 13.5, verticalSpeed: 2, y: 12 },
  ]) {
    let state = armed();
    state = stepTouchAndGoLaunch({ state, frame: frame() });
    state = stepTouchAndGoLaunch({ state, frame: frame() });
    state = stepTouchAndGoLaunch({ state, frame: frame(air) });
    assert.equal(state.active, false);
    assert.equal(state.completed, false);
  }
});

test('meaningful fast climb with real travel completes once', () => {
  let state = armed();
  state = stepTouchAndGoLaunch({ state, frame: frame({ x: 0, y: 10 }) });
  state = stepTouchAndGoLaunch({ state, frame: frame({ x: 1, y: 10 }) });
  state = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 18, verticalSpeed: 3, x: 12, y: 12 }) });
  state = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 20, verticalSpeed: 4, x: 28, y: 22 }) });
  state = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 22, verticalSpeed: 5, x: 48, y: 36 }) });
  assert.equal(state.completed, true);
  assert.deepEqual(touchAndGoLaunchPublicState(state), {
    available: true,
    active: false,
    phase: 'climb',
    completed: true,
  });
  const latched = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 25, verticalSpeed: 5, x: 80, y: 50 }) });
  assert.equal(latched, state);
});

test('pause, recovery, restore, crossing, and malformed telemetry reset incomplete attempts', () => {
  for (const patch of [
    { paused: true },
    { recoveryActive: true },
    { restorePublishing: true },
    { crossingActive: true },
    { position: { x: Number.NaN, y: 10, z: 0 } },
  ]) {
    let state = armed();
    state = stepTouchAndGoLaunch({ state, frame: frame() });
    state = stepTouchAndGoLaunch({ state, frame: frame() });
    state = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 18, verticalSpeed: 3, x: 10, y: 13 }) });
    state = stepTouchAndGoLaunch({ state, frame: frame({ airborne: true, speed: 19, verticalSpeed: 3, x: 18, y: 17, ...patch }) });
    assert.equal(state.active, false);
    assert.equal(state.completed, false);
  }
});

test('public state is bounded and caller objects are not mutated', () => {
  const detail = { completed: true, hidden: 'nope' };
  const initial = createTouchAndGoLaunchState();
  const next = armTouchAndGoLaunch(initial, detail);
  assert.equal(detail.hidden, 'nope');
  assert.deepEqual(Object.keys(touchAndGoLaunchPublicState({ ...next, secret: 'nope' })), [
    'available', 'active', 'phase', 'completed',
  ]);
});
