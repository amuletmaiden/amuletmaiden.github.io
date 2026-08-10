import assert from 'node:assert/strict';
import {
  chooseResumePosition,
  publicResumePositionState,
  resumePositionSafe,
} from '../src/core/resume-position-safety.js';

const live = Object.freeze({ x: 120, y: 220, z: -80 });
const checkpoint = Object.freeze({ x: 80, y: 180, z: -40 });
const fallback = Object.freeze({ x: 0, y: 160, z: 0 });

assert.equal(resumePositionSafe({ position: live, surfaceHeight: 190 }), true);
assert.equal(resumePositionSafe({ position: live, surfaceHeight: 202 }), true, 'exact minimum clearance remains valid');
assert.equal(resumePositionSafe({ position: live, surfaceHeight: 202.01 }), false);
assert.equal(resumePositionSafe({ position: live, surfaceHeight: NaN }), false);
assert.equal(resumePositionSafe({ position: { ...live, y: Infinity }, surfaceHeight: 0 }), false);
assert.equal(resumePositionSafe({ position: live, surfaceHeight: 0, minimumClearance: -1 }), false);

const liveSafe = chooseResumePosition({
  livePosition: live,
  liveSurfaceHeight: 190,
  checkpointPosition: checkpoint,
  checkpointSurfaceHeight: 170,
  fallbackPosition: fallback,
});
assert.equal(liveSafe.source, 'live');
assert.deepEqual(liveSafe.position, live);

const checkpointFallback = chooseResumePosition({
  livePosition: live,
  liveSurfaceHeight: 215,
  checkpointPosition: checkpoint,
  checkpointSurfaceHeight: 150,
  fallbackPosition: fallback,
});
assert.equal(checkpointFallback.source, 'checkpoint');
assert.deepEqual(checkpointFallback.position, checkpoint);

const waterParity = chooseResumePosition({
  livePosition: { x: 40, y: 12, z: 20 },
  liveSurfaceHeight: 0,
  checkpointPosition: { x: 60, y: 36, z: 30 },
  checkpointSurfaceHeight: 0,
  fallbackPosition: fallback,
});
assert.equal(waterParity.source, 'checkpoint', 'water uses the same truthful clearance rule as terrain');

const globalFallback = chooseResumePosition({
  livePosition: live,
  liveSurfaceHeight: 219,
  checkpointPosition: checkpoint,
  checkpointSurfaceHeight: 179,
  fallbackPosition: fallback,
  fallbackSurfaceHeight: 0,
});
assert.equal(globalFallback.source, 'fallback');
assert.deepEqual(globalFallback.position, fallback);

const unavailable = chooseResumePosition({
  livePosition: { x: NaN, y: 1, z: 1 },
  liveSurfaceHeight: 0,
  checkpointPosition: null,
  checkpointSurfaceHeight: 0,
  fallbackPosition: { x: 0, y: 5, z: 0 },
  fallbackSurfaceHeight: 0,
});
assert.equal(unavailable.source, 'unavailable');
assert.equal(unavailable.position, null);
assert.deepEqual(publicResumePositionState(unavailable), { active: false, source: null });
assert.deepEqual(publicResumePositionState(checkpointFallback), { active: true, source: 'checkpoint' });
assert.deepEqual(Object.keys(publicResumePositionState(checkpointFallback)).sort(), ['active', 'source']);

const mutableLive = { x: 10, y: 50, z: 20 };
const mutableCheckpoint = { x: 12, y: 70, z: 22 };
const beforeLive = JSON.stringify(mutableLive);
const beforeCheckpoint = JSON.stringify(mutableCheckpoint);
const chosen = chooseResumePosition({
  livePosition: mutableLive,
  liveSurfaceHeight: 45,
  checkpointPosition: mutableCheckpoint,
  checkpointSurfaceHeight: 30,
  fallbackPosition: fallback,
});
assert.equal(JSON.stringify(mutableLive), beforeLive);
assert.equal(JSON.stringify(mutableCheckpoint), beforeCheckpoint);
assert.notEqual(chosen.position, mutableCheckpoint, 'chosen position is a bounded snapshot, not caller-owned state');

console.log('resume-position-safety: ok');
