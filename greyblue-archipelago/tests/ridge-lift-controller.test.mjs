import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function seeded({ verticalVelocity = 0, planarSpeed = 38, bias = 0 } = {}) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: verticalVelocity, z: planarSpeed };
  controller.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  controller.setEnvironmentVerticalBias(bias);
  return controller;
}

const baseline = seeded().step({ throttle: 0.45, climb: 0 }, 1 / 60);
const lifted = seeded({ bias: 2.8 }).step({ throttle: 0.45, climb: 0 }, 1 / 60);
assert.ok(lifted.velocity.y > baseline.velocity.y, "eligible ridge lift contributes upward authority");
assert.ok(lifted.velocity.y - baseline.velocity.y < 0.25, "ridge lift cannot inject a vertical pop in one frame");

const climbBaseline = seeded().step({ throttle: 0.45, climb: 1 }, 1 / 60);
const climbLifted = seeded({ bias: 2.8 }).step({ throttle: 0.45, climb: 1 }, 1 / 60);
assert.ok(climbLifted.velocity.y > climbBaseline.velocity.y, "ridge air may supplement ordinary climb");
assert.ok(climbLifted.velocity.y < 2, "ordinary response remains bounded on the first frame");

const diveBaseline = seeded().step({ throttle: 0.45, climb: -1 }, 1 / 60);
const diveLifted = seeded({ bias: 2.8 }).step({ throttle: 0.45, climb: -1 }, 1 / 60);
assert.ok(diveLifted.velocity.y > diveBaseline.velocity.y, "ridge air is an environmental contribution, not a hidden control override");
assert.ok(diveLifted.velocity.y < 0, "full dive remains descending despite maximum ridge lift");

const landingBaseline = seeded();
landingBaseline.landingRequested = true;
const landingLifted = seeded({ bias: 2.8 });
landingLifted.landingRequested = true;
const landingA = landingBaseline.step({ throttle: 0.45, climb: 0 }, 1 / 60);
const landingB = landingLifted.step({ throttle: 0.45, climb: 0 }, 1 / 60);
assert.equal(landingB.velocity.y, landingA.velocity.y, "landing suppresses environmental ridge lift exactly");

const takeoffBaseline = new FlightController();
const takeoffLifted = new FlightController();
takeoffLifted.setEnvironmentVerticalBias(2.8);
const launchA = takeoffBaseline.step({ toggleFlight: true, throttle: 0.4 }, 1 / 60);
const launchB = takeoffLifted.step({ toggleFlight: true, throttle: 0.4 }, 1 / 60);
assert.equal(launchB.velocity.y, launchA.velocity.y, "bounded takeoff release remains authoritative over stale ridge bias");

const stalledBaseline = seeded({ planarSpeed: 2 });
const stalledLifted = seeded({ planarSpeed: 2, bias: 2.8 });
const stallA = stalledBaseline.step({ throttle: -1, climb: 0 }, 1 / 60);
const stallB = stalledLifted.step({ throttle: -1, climb: 0 }, 1 / 60);
assert.equal(stallB.velocity.y, stallA.velocity.y, "meaningful stall pressure suppresses ridge lift");

const clamped = seeded();
clamped.setEnvironmentVerticalBias(999);
assert.equal(clamped.environmentVerticalBias, 2.8, "environment bias is hard-capped at the controller boundary");
clamped.setEnvironmentVerticalBias(-5);
assert.equal(clamped.environmentVerticalBias, 0, "negative environmental bias cannot become hidden downforce");
clamped.setEnvironmentVerticalBias(Number.NaN);
assert.equal(clamped.environmentVerticalBias, 0, "malformed bias fails neutral");

const grounded = seeded({ bias: 2.8 });
grounded.airborne = false;
grounded.step({}, 1 / 60);
assert.equal(grounded.environmentVerticalBias, 0, "grounded state clears stale ridge bias");

const settled = seeded({ bias: 2.8, planarSpeed: 4 });
settled.landingRequested = true;
settled.resolveGround({ x: 0, y: -1, z: 0 }, 0);
assert.equal(settled.airborne, false, "truthful landing still settles through the existing ground owner");
assert.equal(settled.environmentVerticalBias, 0, "ground settlement clears stale ridge bias");

const longRun = seeded({ planarSpeed: 36 });
for (let frame = 0; frame < 60 * 60; frame += 1) {
  longRun.setEnvironmentVerticalBias(frame % 180 < 90 ? 2.8 : 0);
  const snapshot = longRun.step({
    throttle: 0.35,
    climb: frame % 240 < 80 ? 0.55 : frame % 240 < 160 ? -0.55 : 0,
    steer: frame % 300 < 150 ? 0.35 : -0.35,
  }, 1 / 60);
  assert.ok(Number.isFinite(snapshot.velocity.y), `finite vertical velocity at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.speed), `finite planar speed at frame ${frame}`);
  assert.ok(Math.abs(snapshot.velocity.y) <= 24, `vertical clamp holds at frame ${frame}`);
}

console.log("ridge-lift controller integration: ok");
