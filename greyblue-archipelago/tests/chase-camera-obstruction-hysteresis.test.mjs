import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChaseCameraRig,
  resolveTerrainObstructionRetention,
} from '../src/flight/chase-camera.js';

const blocked = Object.freeze({ obstructed: true, distance: 12, terrainHeight: 24 });
const clear = Object.freeze({ obstructed: false, distance: 24, terrainHeight: 0 });
const anchor = Object.freeze({ x: 0, y: 20, z: 0 });

function cliffSampler(x, z) {
  if (z <= -14 && z >= -24) return 24;
  return 0;
}

test('obstruction contracts the chase distance immediately', () => {
  const result = resolveTerrainObstructionRetention({
    obstruction: blocked,
    desiredDistance: 24,
  });
  assert.deepEqual(result, {
    distance: 12,
    retainedDistance: 12,
    clearFrames: 0,
    retained: true,
  });
});

test('transient clear samples retain the last safe shortened distance', () => {
  const firstClear = resolveTerrainObstructionRetention({
    obstruction: clear,
    desiredDistance: 24,
    retainedDistance: 12,
    clearFrames: 0,
    releaseFrames: 3,
  });
  assert.deepEqual(firstClear, {
    distance: 12,
    retainedDistance: 12,
    clearFrames: 1,
    retained: true,
  });

  const secondClear = resolveTerrainObstructionRetention({
    obstruction: clear,
    desiredDistance: 24,
    retainedDistance: firstClear.retainedDistance,
    clearFrames: firstClear.clearFrames,
    releaseFrames: 3,
  });
  assert.deepEqual(secondClear, {
    distance: 12,
    retainedDistance: 12,
    clearFrames: 2,
    retained: true,
  });
});

test('sustained clear terrain releases to the current ordinary chase distance', () => {
  const result = resolveTerrainObstructionRetention({
    obstruction: clear,
    desiredDistance: 28,
    retainedDistance: 12,
    clearFrames: 2,
    releaseFrames: 3,
  });
  assert.deepEqual(result, {
    distance: 28,
    retainedDistance: null,
    clearFrames: 0,
    retained: false,
  });
});

test('a closer obstruction preempts a pending clear release immediately', () => {
  const result = resolveTerrainObstructionRetention({
    obstruction: { obstructed: true, distance: 9 },
    desiredDistance: 24,
    retainedDistance: 14,
    clearFrames: 2,
    releaseFrames: 3,
  });
  assert.deepEqual(result, {
    distance: 9,
    retainedDistance: 9,
    clearFrames: 0,
    retained: true,
  });
});

test('retention never holds the camera farther out than the current ordinary target', () => {
  const result = resolveTerrainObstructionRetention({
    obstruction: clear,
    desiredDistance: 10,
    retainedDistance: 14,
    clearFrames: 0,
    releaseFrames: 3,
  });
  assert.equal(result.distance, 10);
  assert.equal(result.retainedDistance, 10);
});

test('malformed or neutral samples count only toward bounded release, not instant extension', () => {
  const result = resolveTerrainObstructionRetention({
    obstruction: null,
    desiredDistance: 24,
    retainedDistance: 12,
    clearFrames: 0,
    releaseFrames: 3,
  });
  assert.deepEqual(result, {
    distance: 12,
    retainedDistance: 12,
    clearFrames: 1,
    retained: true,
  });
});

test('live rig ignores a one-frame ridge-edge clear without pumping outward', () => {
  const rig = new ChaseCameraRig({
    distance: 24,
    height: 10,
    minimumObstructedDistance: 8,
    obstructionDistanceSamples: 9,
    obstructionReleaseFrames: 3,
    smoothing: 1000,
  });

  const obstructed = rig.update({
    target: { ...anchor },
    yaw: 0,
    dt: 1 / 60,
    sampleHeight: cliffSampler,
  });
  const transientClear = rig.update({
    target: { ...anchor },
    yaw: 0,
    dt: 1 / 60,
    sampleHeight: () => 0,
  });

  assert.equal(obstructed.obstructed, true);
  assert.equal(transientClear.obstructed, false);
  assert.ok(Math.abs(transientClear.position.z - obstructed.position.z) < 0.01);
});

test('live rig restores ordinary distance after the bounded clear run', () => {
  const rig = new ChaseCameraRig({
    distance: 24,
    height: 10,
    minimumObstructedDistance: 8,
    obstructionDistanceSamples: 9,
    obstructionReleaseFrames: 3,
    smoothing: 1000,
  });

  rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: cliffSampler });
  rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: () => 0 });
  rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: () => 0 });
  const released = rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: () => 0 });

  assert.equal(released.obstructed, false);
  assert.ok(released.position.z < -23.9);
});

test('recovery snap clears retained ridge history before rebuilding camera geometry', () => {
  const rig = new ChaseCameraRig({
    distance: 24,
    height: 10,
    minimumObstructedDistance: 8,
    obstructionDistanceSamples: 9,
    obstructionReleaseFrames: 3,
    recoveryMinimumAltitude: 20,
    recoveryClearance: 0,
    smoothing: 1000,
  });

  rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: cliffSampler });
  const recoveryTarget = { ...anchor };
  const snapped = rig.snapTo(recoveryTarget, 0, () => 0);

  assert.equal(snapped.obstructed, false);
  assert.ok(snapped.position.z < -23.9);
});

test('ordinary clear flight remains identical with no retained obstruction history', () => {
  const rig = new ChaseCameraRig({ distance: 24, height: 10, obstructionReleaseFrames: 3 });
  const snapshot = rig.update({
    target: { ...anchor },
    yaw: 0,
    speed: 80,
    sampleHeight: () => 0,
  });
  assert.equal(snapshot.obstructed, false);
  assert.equal(snapshot.position.z, -32);
});
