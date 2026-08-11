import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearGroundedCameraSettle,
  createGroundedCameraSettleState,
  groundedCameraComposition,
  stepGroundedCameraSettle,
} from '../src/flight/grounded-camera-settle.js';

test('first grounded frame begins a bounded settle without snapping', () => {
  const next = stepGroundedCameraSettle(createGroundedCameraSettleState(), { grounded: true, dt: 1 / 60 });
  assert.ok(next.blend > 0 && next.blend < 0.2);
  const view = groundedCameraComposition(next);
  assert.ok(view.speedScale < 1 && view.speedScale > 0.8);
  assert.ok(view.distanceOffset < 0 && view.distanceOffset > -0.4);
});

test('sustained grounded truth progressively calms residual flight composition', () => {
  let state = createGroundedCameraSettleState();
  for (let frame = 0; frame < 60; frame += 1) {
    state = stepGroundedCameraSettle(state, { grounded: true, dt: 1 / 60 });
  }
  const view = groundedCameraComposition(state);
  assert.ok(view.blend > 0.98);
  assert.ok(view.speedScale < 0.02);
  assert.ok(view.bankScale < 0.02);
  assert.ok(view.distanceOffset >= -2 && view.distanceOffset < -1.9);
  assert.ok(view.heightOffset >= -1.5 && view.heightOffset < -1.4);
  assert.ok(view.lookAheadOffset >= -3 && view.lookAheadOffset < -2.9);
});

test('airborne truth releases the settle promptly toward ordinary chase composition', () => {
  let state = { blend: 1 };
  const first = stepGroundedCameraSettle(state, { grounded: false, dt: 1 / 60 });
  assert.ok(first.blend < 1 && first.blend > 0.7);
  state = first;
  for (let frame = 0; frame < 45; frame += 1) {
    state = stepGroundedCameraSettle(state, { grounded: false, dt: 1 / 60 });
  }
  assert.ok(state.blend < 0.002);
  const view = groundedCameraComposition(state);
  assert.ok(view.speedScale > 0.998);
  assert.ok(view.bankScale > 0.998);
});

test('malformed grounded and timing inputs fail to ordinary airborne semantics', () => {
  const malformed = stepGroundedCameraSettle({ blend: Number.NaN }, { grounded: 'yes', dt: Number.NaN });
  assert.deepEqual(malformed, { blend: 0 });
  assert.deepEqual(groundedCameraComposition({ blend: Number.POSITIVE_INFINITY }), {
    blend: 0,
    speedScale: 1,
    bankScale: 1,
    distanceOffset: 0,
    heightOffset: 0,
    lookAheadOffset: 0,
  });
});

test('clear resets transient grounded history', () => {
  assert.deepEqual(clearGroundedCameraSettle({ blend: 0.9 }), { blend: 0 });
});

test('caller state and frame are not mutated', () => {
  const state = { blend: 0.4 };
  const frame = { grounded: true, dt: 1 / 60 };
  const beforeState = structuredClone(state);
  const beforeFrame = structuredClone(frame);
  stepGroundedCameraSettle(state, frame);
  assert.deepEqual(state, beforeState);
  assert.deepEqual(frame, beforeFrame);
});
