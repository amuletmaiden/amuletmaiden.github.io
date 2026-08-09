import assert from 'node:assert/strict';
import {
  createLowFlightWakeState,
  stepLowFlightWake,
  lowFlightWakePresentation,
  lowFlightWakePublicState,
} from '../src/core/low-flight-wake.js';

function frame(overrides = {}) {
  return {
    ready: true,
    paused: false,
    grounded: false,
    recoveryActive: false,
    restorePublishing: false,
    position: { x: 0, y: 20, z: 0 },
    speed: 50,
    surface: 'water',
    surfaceHeight: 0,
    fogDensity: 0.0004,
    ...overrides,
  };
}

{
  const state = stepLowFlightWake({ state: createLowFlightWakeState(), frame: frame(), now: 1000 });
  assert.equal(state.wakeClass, 'water');
  assert.equal(state.samples.length, 1);
  assert.deepEqual(lowFlightWakePublicState(state), { active: true, wakeClass: 'water' });
}

{
  const state = stepLowFlightWake({ state: createLowFlightWakeState(), frame: frame({ surface: 'terrain', position: { x: 0, y: 35, z: 0 }, fogDensity: 0.001 }), now: 1000 });
  assert.equal(state.wakeClass, 'mist');
}

{
  for (const overrides of [
    { speed: 10 },
    { position: { x: 0, y: 80, z: 0 } },
    { grounded: true },
    { paused: true },
    { recoveryActive: true },
    { restorePublishing: true },
    { ready: false },
  ]) {
    const state = stepLowFlightWake({ state: createLowFlightWakeState(), frame: frame(overrides), now: 1000 });
    assert.equal(state.samples.length, 0);
    assert.deepEqual(lowFlightWakePublicState(state), { active: false, wakeClass: null });
  }
}

{
  let state = createLowFlightWakeState();
  for (let index = 0; index < 20; index += 1) {
    state = stepLowFlightWake({ state, frame: frame({ position: { x: index * 20, y: 20, z: 0 } }), now: 1000 + index * 50 });
  }
  assert.equal(state.samples.length, 10);
  state = stepLowFlightWake({ state, frame: frame({ position: { x: 500, y: 20, z: 0 } }), now: 4000 });
  assert.equal(state.samples.length, 1);
}

{
  let state = createLowFlightWakeState();
  state = stepLowFlightWake({ state, frame: frame(), now: 1000 });
  state = stepLowFlightWake({ state, frame: frame({ position: { x: 5, y: 20, z: 0 } }), now: 1050 });
  assert.equal(state.samples.length, 1);
}

{
  let state = createLowFlightWakeState();
  for (let index = 0; index < 6; index += 1) {
    state = stepLowFlightWake({ state, frame: frame({ position: { x: index * 20, y: 20, z: 0 } }), now: 1000 + index * 50, reducedMotion: true });
  }
  assert.ok(state.samples.length <= 2);
  assert.equal(lowFlightWakePublicState(state).wakeClass, 'water');
}

{
  const state = stepLowFlightWake({ state: createLowFlightWakeState(), frame: frame(), now: 1000 });
  const normal = lowFlightWakePresentation(state);
  const contrast = lowFlightWakePresentation(state, { highContrast: true });
  assert.equal(normal.depthTest, true);
  assert.equal(normal.depthWrite, false);
  assert.equal(normal.fog, true);
  assert.ok(contrast.opacity > normal.opacity);
}

{
  const malformed = stepLowFlightWake({ state: { samples: [{ x: NaN }] }, frame: frame({ position: { x: Infinity, y: 0, z: 0 } }), now: NaN });
  assert.deepEqual(lowFlightWakePublicState(malformed), { active: false, wakeClass: null });
}

{
  const source = frame();
  const copy = JSON.stringify(source);
  const state = stepLowFlightWake({ state: createLowFlightWakeState(), frame: source, now: 1000 });
  assert.equal(JSON.stringify(source), copy);
  assert.deepEqual(Object.keys(lowFlightWakePublicState(state)).sort(), ['active', 'wakeClass']);
}

console.log('low-flight-wake regressions defined');
