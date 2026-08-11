import assert from 'node:assert/strict';
import test from 'node:test';
import { ChaseCameraRig, resolveTerrainObstructionDistance } from '../src/flight/chase-camera.js';

const anchor = Object.freeze({ x: 0, y: 20, z: 0 });
const forward = Object.freeze({ x: 0, z: 1 });

function cliffSampler(x, z) {
  if (z <= -14 && z >= -24) return 24;
  return 0;
}

test('blocked full chase ray pulls inward to the longest sampled safe distance', () => {
  const result = resolveTerrainObstructionDistance({
    anchor,
    forward,
    desiredDistance: 24,
    desiredY: 30,
    sampleHeight: cliffSampler,
    terrainClearance: 5,
    minimumDistance: 8,
    distanceSamples: 9,
  });
  assert.equal(result.obstructed, true);
  assert.ok(result.distance < 24);
  assert.ok(result.distance >= 8);
});

test('clear terrain preserves ordinary chase distance exactly', () => {
  const result = resolveTerrainObstructionDistance({
    anchor,
    forward,
    desiredDistance: 31,
    desiredY: 30,
    sampleHeight: () => 0,
    terrainClearance: 5,
  });
  assert.deepEqual(result, { distance: 31, terrainHeight: 0, obstructed: false });
});

test('minimum distance is bounded when obstruction reaches the dragon', () => {
  const result = resolveTerrainObstructionDistance({
    anchor,
    forward,
    desiredDistance: 24,
    desiredY: 24,
    sampleHeight: () => 30,
    terrainClearance: 5,
    minimumDistance: 10,
  });
  assert.equal(result.obstructed, true);
  assert.equal(result.distance, 10);
  assert.equal(result.terrainHeight, 30);
});

test('missing sampler data stays neutral rather than inventing obstruction', () => {
  const result = resolveTerrainObstructionDistance({
    anchor,
    forward,
    desiredDistance: 28,
    desiredY: 30,
    sampleHeight: () => Number.NaN,
  });
  assert.equal(result.obstructed, false);
  assert.equal(result.distance, 28);
});

test('rig pulls inward instead of solving every ridge only by vertical lift', () => {
  const rig = new ChaseCameraRig({
    distance: 24,
    height: 10,
    terrainClearance: 5,
    minimumObstructedDistance: 8,
    obstructionDistanceSamples: 9,
    smoothing: 20,
  });
  const blocked = rig.update({
    target: { ...anchor },
    yaw: 0,
    speed: 0,
    dt: 1 / 60,
    sampleHeight: cliffSampler,
  });
  assert.equal(blocked.obstructed, true);
  assert.ok(Math.abs(blocked.position.z) < 24);
  assert.equal(blocked.position.y, 30);
});

test('rig restores normal chase geometry after terrain clears', () => {
  const rig = new ChaseCameraRig({ distance: 24, height: 10, smoothing: 30 });
  rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: cliffSampler });
  let snapshot;
  for (let index = 0; index < 20; index += 1) {
    snapshot = rig.update({ target: { ...anchor }, yaw: 0, dt: 1 / 60, sampleHeight: () => 0 });
  }
  assert.equal(snapshot.obstructed, false);
  assert.ok(snapshot.position.z < -22);
});

test('bank and speed keep their existing influence while obstruction distance stays bounded', () => {
  const rig = new ChaseCameraRig({ distance: 24, height: 10, minimumObstructedDistance: 9 });
  const snapshot = rig.update({
    target: { ...anchor },
    yaw: 0,
    bank: 0.6,
    speed: 80,
    sampleHeight: cliffSampler,
  });
  assert.equal(snapshot.obstructed, true);
  assert.notEqual(snapshot.position.x, 0);
  assert.ok(snapshot.position.z >= -32 && snapshot.position.z <= -9);
});
