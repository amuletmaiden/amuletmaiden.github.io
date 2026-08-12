import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMERA_FREE_LOOK_LIMITS,
  cameraFreeLookTelemetry,
  resetCameraFreeLook,
  stepCameraFreeLook,
} from '../src/flight/camera-free-look.js';

test('integrates bounded horizontal and vertical look without exposing raw axes', () => {
  let state = resetCameraFreeLook();
  for (let index = 0; index < 200; index += 1) {
    state = stepCameraFreeLook(state, { lookX: 1, lookY: 1, dt: 0.05 });
  }
  assert.equal(state.active, true);
  assert.equal(state.yawOffset, CAMERA_FREE_LOOK_LIMITS.yaw);
  assert.equal(state.pitchOffset, CAMERA_FREE_LOOK_LIMITS.pitchUp);
  assert.deepEqual(Object.keys(cameraFreeLookTelemetry(state)).sort(), ['active', 'direction']);
});

test('opposite input immediately reverses the offset trend', () => {
  const right = stepCameraFreeLook(resetCameraFreeLook(), { lookX: 1, dt: 0.05 });
  const reversed = stepCameraFreeLook(right, { lookX: -1, dt: 0.05 });
  assert.ok(reversed.yawOffset < right.yawOffset);
});

test('neutral input recenters smoothly and monotonically', () => {
  let state = resetCameraFreeLook();
  for (let index = 0; index < 8; index += 1) state = stepCameraFreeLook(state, { lookX: 1, lookY: -0.4, dt: 0.05 });
  let previousMagnitude = Math.hypot(state.yawOffset, state.pitchOffset);
  for (let index = 0; index < 40; index += 1) {
    state = stepCameraFreeLook(state, { dt: 0.05 });
    const magnitude = Math.hypot(state.yawOffset, state.pitchOffset);
    assert.ok(magnitude <= previousMagnitude + 1e-12);
    previousMagnitude = magnitude;
  }
  assert.ok(previousMagnitude < 0.001);
});

test('reduced motion preserves geometry but recenters faster', () => {
  let ordinary = { yawOffset: 0.8, pitchOffset: 0.3, active: true };
  let reduced = { ...ordinary };
  ordinary = stepCameraFreeLook(ordinary, { dt: 0.05 });
  reduced = stepCameraFreeLook(reduced, { dt: 0.05, reducedMotion: true });
  assert.ok(Math.abs(reduced.yawOffset) < Math.abs(ordinary.yawOffset));
  assert.ok(Math.abs(reduced.pitchOffset) < Math.abs(ordinary.pitchOffset));
});

test('interruptions reset transient camera history', () => {
  const active = stepCameraFreeLook(resetCameraFreeLook(), { lookX: 1, dt: 0.05 });
  assert.equal(active.active, true);
  assert.deepEqual(stepCameraFreeLook(active, { interrupted: true, dt: 0.05 }), resetCameraFreeLook());
});

test('malformed axes and frame delta remain finite and bounded', () => {
  const state = stepCameraFreeLook({ yawOffset: Infinity, pitchOffset: NaN, active: true }, {
    lookX: Infinity,
    lookY: 'bad',
    dt: Infinity,
  });
  assert.ok(Number.isFinite(state.yawOffset));
  assert.ok(Number.isFinite(state.pitchOffset));
  assert.ok(Math.abs(state.yawOffset) <= CAMERA_FREE_LOOK_LIMITS.yaw);
  assert.ok(state.pitchOffset <= CAMERA_FREE_LOOK_LIMITS.pitchUp);
  assert.ok(state.pitchOffset >= CAMERA_FREE_LOOK_LIMITS.pitchDown);
});
