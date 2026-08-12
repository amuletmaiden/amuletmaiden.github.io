import assert from "node:assert/strict";
import { RidgeRideLine } from "../src/core/ridge-ride-line.js";

function sample(x, z, ridgeLiftActive = true, extra = {}) {
  return {
    ready: true,
    airborne: true,
    ridgeLiftActive,
    position: { x, z },
    ...extra,
  };
}

const ride = new RidgeRideLine({ armSamples: 3, minimumSpacing: 8, completionTravel: 40, gapSamples: 2 });
assert.deepEqual(ride.publicState(), { available: true, active: false, phase: "catch", completed: false });
ride.update(sample(0, 0));
ride.update(sample(10, 0));
let state = ride.update(sample(20, 0));
assert.equal(state.active, true, "three spaced truthful lift samples arm the ride");
assert.equal(state.phase, "ride");
ride.update(sample(30, 0));
ride.update(sample(40, 0));
ride.update(sample(50, 0));
ride.update(sample(60, 0));
state = ride.update(sample(68, 0, false));
assert.equal(state.phase, "release", "eligible airborne exit enters release phase");
ride.update(sample(76, 0, false));
state = ride.update(sample(84, 0, false));
assert.equal(state.completed, true, "sustained clean exit completes after enough ridge travel");
assert.deepEqual(state, { available: false, active: false, phase: "release", completed: true });

const hover = new RidgeRideLine({ armSamples: 3, minimumSpacing: 8 });
for (let i = 0; i < 20; i += 1) hover.update(sample(0.5 * (i % 2), 0));
assert.equal(hover.publicState().active, false, "hover/jitter cannot arm a ridge ride");

const shortGap = new RidgeRideLine({ armSamples: 2, minimumSpacing: 8, completionTravel: 100, gapSamples: 2 });
shortGap.update(sample(0, 0));
shortGap.update(sample(10, 0));
assert.equal(shortGap.publicState().active, true);
shortGap.update(sample(20, 0));
shortGap.update(sample(30, 0, false));
state = shortGap.update(sample(40, 0, true));
assert.equal(state.active, true, "brief ridge-lift gaps retain the ride");
assert.equal(state.phase, "ride");

const premature = new RidgeRideLine({ armSamples: 2, minimumSpacing: 8, completionTravel: 100, gapSamples: 1 });
premature.update(sample(0, 0));
premature.update(sample(10, 0));
premature.update(sample(20, 0));
premature.update(sample(30, 0, false));
state = premature.update(sample(40, 0, false));
assert.equal(state.completed, false, "early exit cannot complete");
assert.equal(state.active, false, "long premature gap resets the run");
assert.equal(state.phase, "catch");

for (const interrupted of [
  { paused: true },
  { airborne: false },
  { grounded: true },
  { landing: true },
  { recovering: true },
  { restoring: true },
  { crossing: true },
  { ready: false },
]) {
  const model = new RidgeRideLine({ armSamples: 2, minimumSpacing: 8 });
  model.update(sample(0, 0));
  model.update(sample(10, 0));
  assert.equal(model.publicState().active, true);
  state = model.update(sample(20, 0, true, interrupted));
  assert.deepEqual(state, { available: true, active: false, phase: "catch", completed: false });
}

const teleport = new RidgeRideLine({ armSamples: 2, minimumSpacing: 8, maximumStep: 50 });
teleport.update(sample(0, 0));
teleport.update(sample(10, 0));
assert.equal(teleport.publicState().active, true);
state = teleport.update(sample(500, 0));
assert.equal(state.active, false, "teleport-like movement resets traversal continuity");
assert.equal(state.completed, false);

const malformed = new RidgeRideLine();
assert.doesNotThrow(() => malformed.update({ ready: true, airborne: true, ridgeLiftActive: true, position: { x: NaN, z: 0 } }));
assert.equal(malformed.publicState().active, false);

const input = sample(0, 0);
const frozenCopy = JSON.stringify(input);
new RidgeRideLine().update(input);
assert.equal(JSON.stringify(input), frozenCopy, "caller telemetry remains untouched");

console.log("ridge-ride line: ok");
