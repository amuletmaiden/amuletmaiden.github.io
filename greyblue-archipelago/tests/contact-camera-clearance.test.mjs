import test from 'node:test';
import assert from 'node:assert/strict';

import { createContactState, resolveContact } from '../src/flight/contact-resolution.js';
import { createObstructionState, resolveCameraObstruction } from '../src/camera/obstruction-clearance.js';

test('shallow deliberate touchdown lands and preserves relaunch', () => {
  const landed = resolveContact({
    previous: createContactState(),
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 4, y: -2, z: 0 },
    flightMode: 'landing',
    contact: { hit: true, penetration: 0.2, normal: { x: 0, y: 1, z: 0 } },
    dt: 1 / 60,
  });
  assert.equal(landed.state.mode, 'landed');
  assert.equal(landed.state.grounded, true);
  assert.equal(landed.telemetry.contactKind, 'touchdown');

  const relaunched = resolveContact({
    previous: landed.state,
    position: { x: 0, y: 1, z: 0 },
    surfaceHeight: 0,
    velocity: { x: 0, y: 3, z: 0 },
  });
  assert.equal(relaunched.state.mode, 'airborne');
  assert.equal(relaunched.state.grounded, false);
});

test('steep contact enters bounded recovery without energy injection', () => {
  const result = resolveContact({
    position: { x: 0, y: -1, z: 0 },
    velocity: { x: 18, y: -12, z: 3 },
    flightMode: 'powered',
    contact: { hit: true, penetration: 2, normal: { x: 0, y: 1, z: 0 } },
    dt: 1 / 30,
  });
  assert.equal(result.state.mode, 'recovering');
  assert.equal(result.telemetry.contactKind, 'crash');
  assert.ok(result.telemetry.correction <= 1.5);
  assert.ok(Math.hypot(result.velocity.x, result.velocity.y, result.velocity.z) < Math.hypot(18, -12, 3));
});

test('repeated separation converges deterministically', () => {
  let previous = createContactState();
  let last = Infinity;
  for (let i = 0; i < 12; i += 1) {
    const result = resolveContact({
      previous,
      position: { x: 0, y: -0.4, z: 0 },
      velocity: { x: 0, y: -4, z: 0 },
      contact: { hit: true, penetration: i === 0 ? 0.4 : 0, normal: { x: 0, y: 1, z: 0 } },
      dt: 1 / 60,
    });
    assert.ok(result.state.separation <= last);
    last = result.state.separation;
    previous = result.state;
  }
});

test('malformed contact data falls back to finite output and does not mutate input', () => {
  const input = Object.freeze({
    position: Object.freeze({ x: 1, y: 2, z: 3 }),
    velocity: Object.freeze({ x: 1, y: -1, z: 0 }),
    contact: Object.freeze({ hit: true, penetration: Number.NaN, normal: Object.freeze({ y: Number.NaN }) }),
  });
  const before = JSON.stringify(input);
  const result = resolveContact(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.telemetry.fallbackUsed, true);
  assert.ok(Number.isFinite(result.position.y));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('camera retracts quickly and releases only after hysteresis', () => {
  let previous = createObstructionState(12);
  const blocked = resolveCameraObstruction({ previous, desiredDistance: 12, obstructed: true, hitDistance: 5, dt: 0.1 });
  assert.equal(blocked.state.obstructed, true);
  assert.ok(blocked.state.distance < 12);
  previous = blocked.state;

  for (let i = 0; i < 3; i += 1) {
    const held = resolveCameraObstruction({ previous, desiredDistance: 12, obstructed: false, dt: 0.1 });
    assert.equal(held.state.obstructed, true);
    previous = held.state;
  }
  const released = resolveCameraObstruction({ previous, desiredDistance: 12, obstructed: false, dt: 0.1 });
  assert.equal(released.state.obstructed, false);
  assert.ok(released.state.distance > previous.distance);
});

test('camera output stays finite for malformed samples and stable banked framing inputs', () => {
  const previous = createObstructionState(10);
  const malformed = resolveCameraObstruction({ previous, desiredDistance: Number.NaN, obstructed: true, hitDistance: Number.NaN, dt: Number.NaN });
  assert.equal(malformed.telemetry.fallbackUsed, true);
  assert.ok(Number.isFinite(malformed.state.distance));
  assert.doesNotThrow(() => JSON.stringify(malformed));

  const first = resolveCameraObstruction({ previous, desiredDistance: 10, obstructed: true, hitDistance: 6, dt: 1 / 60 });
  const second = resolveCameraObstruction({ previous, desiredDistance: 10, obstructed: true, hitDistance: 6, dt: 1 / 60 });
  assert.deepEqual(first, second);
});
