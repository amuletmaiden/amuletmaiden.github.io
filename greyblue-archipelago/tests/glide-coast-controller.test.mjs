import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function seeded(speed, verticalVelocity = 0) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: verticalVelocity, z: speed };
  controller.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  return controller;
}

const coast = seeded(54);
const firstCoast = coast.step({ throttle: 0 }, 1 / 60);
assert.ok(firstCoast.speed > 52, "neutral throttle retains most earned speed on the first glide frame");
assert.ok(firstCoast.speed < 54, "neutral glide never accelerates the dragon");
let previous = firstCoast.speed;
for (let frame = 0; frame < 240; frame += 1) {
  const snapshot = coast.step({ throttle: 0 }, 1 / 60);
  assert.ok(snapshot.speed <= previous + 1e-9, `coast decays monotonically at frame ${frame}`);
  assert.ok(snapshot.speed >= 19.9, `coast cannot decay below the ordinary baseline at frame ${frame}`);
  previous = snapshot.speed;
}
assert.ok(previous < 30, "sustained neutral glide eventually returns toward ordinary cruise speed");

const powered = seeded(54).step({ throttle: 1 }, 1 / 60);
assert.ok(powered.speed > 54, "positive throttle remains authoritative immediately");

const braking = seeded(54).step({ throttle: -1 }, 1 / 60);
assert.ok(braking.speed < firstCoast.speed, "reverse throttle cancels coast and slows more strongly");

const lowSpeed = seeded(24).step({ throttle: 0 }, 1 / 60);
assert.ok(lowSpeed.speed < 24, "low-speed neutral flight keeps ordinary target behavior");

const landingController = seeded(54);
landingController.landingRequested = true;
const landing = landingController.step({ throttle: 0 }, 1 / 60);
assert.ok(landing.speed < firstCoast.speed, "landing cap remains authoritative over coast");
assert.equal(landing.mode, "landing", "landing mode remains unchanged");

const takeoff = new FlightController();
const launch = takeoff.step({ toggleFlight: true, throttle: 0 }, 1 / 60);
assert.ok(launch.velocity.y > 0, "takeoff lift remains authoritative");
assert.ok(takeoff.takeoffLiftElapsed < TAKEOFF_LIFT_DURATION, "takeoff transient remains active after launch");

const stalled = seeded(6);
let stalledSnapshot = stalled.step({ throttle: -1 }, 1 / 60);
for (let frame = 0; frame < 360; frame += 1) stalledSnapshot = stalled.step({ throttle: -1 }, 1 / 60);
assert.ok(stalledSnapshot.speed >= 10.5, "existing stall recovery still restores airflow");
assert.ok(stalledSnapshot.stallFactor < 0.2, "stall pressure relaxes after recovery");

const dive = seeded(40, -10).step({ throttle: 0.5 }, 1 / 60);
const level = seeded(40, 0).step({ throttle: 0.5 }, 1 / 60);
assert.ok(dive.speed > level.speed, "vertical-energy dive gain remains active under deliberate throttle");

const malformed = seeded(44);
malformed.velocity.z = Number.NaN;
const repaired = malformed.step({ throttle: 0 }, 1 / 60);
assert.ok(Number.isFinite(repaired.speed), "non-finite controller state still repairs safely");

const longRun = seeded(58);
for (let frame = 0; frame < 60 * 60; frame += 1) {
  const phase = frame % 480;
  const snapshot = longRun.step({
    throttle: phase < 180 ? 0 : phase < 260 ? 0.75 : phase < 320 ? -0.7 : 0,
    climb: phase < 120 ? -0.4 : phase < 240 ? 0.35 : 0,
    steer: phase < 240 ? 0.55 : -0.45,
  }, 1 / 60);
  assert.ok(Number.isFinite(snapshot.speed), `finite speed at frame ${frame}`);
  assert.ok(snapshot.speed < 80, `bounded planar speed at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.velocity.y), `finite vertical velocity at frame ${frame}`);
}

console.log("glide coast controller tests passed");
