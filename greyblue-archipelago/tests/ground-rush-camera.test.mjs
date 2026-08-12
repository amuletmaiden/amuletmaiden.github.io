import assert from "node:assert/strict";
import {
  deriveGroundRushCameraComposition,
  GROUND_RUSH_CAMERA_LIMITS,
} from "../src/flight/ground-rush-camera.js";

const neutral = deriveGroundRushCameraComposition();
assert.deepEqual(neutral, {
  active: false,
  strength: 0,
  distanceOffset: 0,
  lookAheadOffset: 0,
}, "missing terrain truth remains ordinary camera parity");

assert.equal(deriveGroundRushCameraComposition({
  speed: 18,
  clearance: 8,
}).active, false, "low speed never manufactures ground rush");
assert.equal(deriveGroundRushCameraComposition({
  speed: 60,
  clearance: 80,
}).active, false, "high-clearance cruise remains ordinary parity");
assert.equal(deriveGroundRushCameraComposition({
  speed: 60,
  clearance: 8,
  grounded: true,
}).active, false, "grounded settle remains authoritative");
assert.equal(deriveGroundRushCameraComposition({
  speed: 60,
  clearance: 8,
  obstructed: true,
}).active, false, "terrain obstruction response remains authoritative");

const fastLow = deriveGroundRushCameraComposition({
  speed: GROUND_RUSH_CAMERA_LIMITS.fullSpeed,
  clearance: GROUND_RUSH_CAMERA_LIMITS.fullClearance,
});
assert.equal(fastLow.active, true);
assert.ok(fastLow.distanceOffset < 0, "fast low flight pulls the chase composition slightly closer");
assert.ok(fastLow.lookAheadOffset > 0, "fast low flight reads slightly farther along the trajectory");
assert.ok(Math.abs(fastLow.distanceOffset) <= GROUND_RUSH_CAMERA_LIMITS.maximumDistanceContraction);
assert.ok(fastLow.lookAheadOffset <= GROUND_RUSH_CAMERA_LIMITS.maximumLookAheadGain);

const medium = deriveGroundRushCameraComposition({ speed: 38, clearance: 28 });
assert.ok(medium.strength > 0 && medium.strength < 1, "response grows continuously inside the low-flight envelope");
const faster = deriveGroundRushCameraComposition({ speed: 48, clearance: 28 });
assert.ok(faster.strength > medium.strength, "more speed strengthens the same safe low-clearance readback");
const higher = deriveGroundRushCameraComposition({ speed: 48, clearance: 36 });
assert.ok(higher.strength < faster.strength, "gaining clearance releases ground rush toward ordinary chase geometry");

const reduced = deriveGroundRushCameraComposition({
  speed: GROUND_RUSH_CAMERA_LIMITS.fullSpeed,
  clearance: GROUND_RUSH_CAMERA_LIMITS.fullClearance,
  reducedMotion: true,
});
assert.ok(reduced.active, "reduced motion preserves the same qualitative low-flight geometry");
assert.ok(reduced.strength < fastLow.strength, "reduced motion substantially contracts camera excursion");

for (const malformed of [
  { speed: Number.NaN, clearance: 8 },
  { speed: 60, clearance: Number.NaN },
  { speed: Number.POSITIVE_INFINITY, clearance: 8 },
  { speed: 60, clearance: Number.NEGATIVE_INFINITY },
]) {
  const result = deriveGroundRushCameraComposition(malformed);
  assert.equal(result.active, false, "malformed state fails neutral");
  assert.ok(Number.isFinite(result.strength));
  assert.ok(Number.isFinite(result.distanceOffset));
  assert.ok(Number.isFinite(result.lookAheadOffset));
}

for (let frame = 0; frame < 60 * 60; frame += 1) {
  const result = deriveGroundRushCameraComposition({
    speed: 36 + Math.sin(frame / 37) * 30,
    clearance: 25 + Math.sin(frame / 53) * 24,
    reducedMotion: frame % 600 > 450,
  });
  assert.ok(result.strength >= 0 && result.strength <= 1, `bounded strength at frame ${frame}`);
  assert.ok(Number.isFinite(result.distanceOffset), `finite distance adjustment at frame ${frame}`);
  assert.ok(Number.isFinite(result.lookAheadOffset), `finite look-ahead adjustment at frame ${frame}`);
}

console.log("ground-rush-camera: ok");
