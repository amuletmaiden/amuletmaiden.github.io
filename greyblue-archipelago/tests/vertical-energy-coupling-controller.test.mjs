import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function seeded(verticalVelocity, planarSpeed = 40) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: verticalVelocity, z: planarSpeed };
  controller.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  return controller;
}

const level = seeded(0).step({ throttle: 0.5 }, 1 / 60);
const dive = seeded(-10).step({ throttle: 0.5 }, 1 / 60);
const climb = seeded(10).step({ throttle: 0.5 }, 1 / 60);
assert.ok(dive.speed > level.speed, "a committed dive gathers modest forward speed");
assert.ok(climb.speed < level.speed, "a sustained climb trades some forward speed");
assert.ok(dive.speed - level.speed < 0.3, "one frame cannot inject a speed boost");
assert.ok(level.speed - climb.speed < 0.2, "one frame climb tradeoff remains restrained");

const takeoff = new FlightController();
const takeoffSnapshot = takeoff.step({ toggleFlight: true, throttle: 0.5, climb: 1 }, 1 / 60);
assert.ok(takeoffSnapshot.velocity.y > 0, "takeoff lift remains authoritative");
assert.ok(takeoff.takeoffLiftElapsed < TAKEOFF_LIFT_DURATION, "takeoff transient remains active after launch");

const landing = seeded(-12, 40);
landing.landingRequested = true;
const landingSnapshot = landing.step({ throttle: 1, climb: -1 }, 1 / 60);
assert.equal(landingSnapshot.landingRequested, true, "landing remains requested");
assert.ok(landingSnapshot.speed < 40, "landing cap wins over descending energy gain");

const stalledClimb = seeded(10, 6);
let stalledSnapshot = stalledClimb.step({ throttle: -1 }, 1 / 60);
for (let i = 0; i < 360; i += 1) stalledSnapshot = stalledClimb.step({ throttle: -1 }, 1 / 60);
assert.ok(stalledSnapshot.speed >= 10.5, "climb tradeoff cannot defeat existing stall recovery speed");
assert.ok(stalledSnapshot.stallFactor < 0.2, "stall recovery still relaxes after airflow returns");

const longRun = seeded(0, 30);
for (let frame = 0; frame < 60 * 60; frame += 1) {
  const phase = frame % 360;
  const snapshot = longRun.step({
    throttle: phase < 180 ? 0.8 : 0.15,
    climb: phase < 120 ? -0.9 : phase < 240 ? 0.9 : 0,
    steer: phase < 180 ? 0.6 : -0.6,
  }, 1 / 60);
  assert.ok(Number.isFinite(snapshot.speed), `finite speed at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.velocity.y), `finite vertical velocity at frame ${frame}`);
  assert.ok(snapshot.speed < 80, `bounded planar speed at frame ${frame}`);
  assert.ok(Math.abs(snapshot.velocity.y) <= 24, `bounded vertical velocity at frame ${frame}`);
}

console.log("vertical energy controller tests passed");
