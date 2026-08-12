import assert from "node:assert/strict";
import { LiveRidgeRide, ridgeRideCompletionMessage } from "../src/core/ridge-ride-live.js";

const sample = (x, ridgeLiftActive = true, extra = {}) => ({
  ready: true,
  paused: false,
  airborne: true,
  grounded: false,
  landing: false,
  recovering: false,
  restoring: false,
  crossing: false,
  ridgeLiftActive,
  position: { x, z: 0 },
  ...extra,
});

const live = new LiveRidgeRide({ armSamples: 2, minimumSpacing: 8, completionTravel: 24, gapSamples: 1 });
let result = live.update(sample(0));
assert.equal(result.completedNow, false);
result = live.update(sample(10));
assert.equal(result.state.active, true);
live.update(sample(20));
live.update(sample(30));
live.update(sample(40));
result = live.update(sample(48, false));
assert.equal(result.state.phase, "release");
assert.equal(result.completedNow, false);
result = live.update(sample(56, false));
assert.equal(result.state.completed, true);
assert.equal(result.completedNow, true, "completion edge publishes once");
assert.equal(ridgeRideCompletionMessage(result), "The ridge wind falls away behind you.");
result = live.update(sample(64, false));
assert.equal(result.completedNow, false, "completed traversal cannot republish");
assert.equal(ridgeRideCompletionMessage(result), null);
assert.deepEqual(Object.keys(result.state).sort(), ["active", "available", "completed", "phase"]);

for (const interruption of [
  { paused: true },
  { airborne: false },
  { grounded: true },
  { landing: true },
  { recovering: true },
  { restoring: true },
  { crossing: true },
  { ready: false },
]) {
  const model = new LiveRidgeRide({ armSamples: 2, minimumSpacing: 8 });
  model.update(sample(0));
  assert.equal(model.update(sample(10)).state.active, true);
  const interrupted = model.update(sample(20, true, interruption));
  assert.deepEqual(interrupted.state, { available: true, active: false, phase: "catch", completed: false });
  assert.equal(interrupted.completedNow, false);
}

const hidden = sample(0);
const before = JSON.stringify(hidden);
new LiveRidgeRide().update(hidden);
assert.equal(JSON.stringify(hidden), before, "live composition never mutates caller truth");

const malformed = new LiveRidgeRide();
assert.doesNotThrow(() => malformed.update({ ready: true, airborne: true, ridgeLiftActive: true, position: { x: NaN, z: 0 } }));
assert.equal(malformed.publicState().active, false);

console.log("ridge-ride live: ok");
