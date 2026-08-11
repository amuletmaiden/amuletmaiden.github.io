import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function seeded({ speed = 48, bank = 0.55, landingRequested = false, takeoffActive = false } = {}) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: 0, z: speed };
  controller.bank = bank;
  controller.landingRequested = landingRequested;
  controller.takeoffLiftElapsed = takeoffActive ? 0 : TAKEOFF_LIFT_DURATION;
  return controller;
}

const release = seeded();
const released = release.step({ throttle: 0, steer: 0 }, 1 / 60);
assert.ok(released.yaw > 0, "releasing steer while visibly banked keeps a small same-sign turn");
assert.ok(released.bank > 0, "existing bank pose remains committed on the release frame");

const leftRelease = seeded({ bank: -0.55 }).step({ throttle: 0, steer: 0 }, 1 / 60);
assert.ok(leftRelease.yaw < 0, "left-bank release carries the turn left");
assert.ok(Math.abs(leftRelease.yaw + released.yaw) < 1e-12, "live left/right carry stays symmetric");

const explicitOpposite = seeded().step({ throttle: 0, steer: -0.5 }, 1 / 60);
assert.ok(explicitOpposite.yaw < 0, "explicit opposite steering reverses immediately instead of fighting hidden carry");

const explicitSame = seeded().step({ throttle: 0, steer: 0.5 }, 1 / 60);
assert.ok(explicitSame.yaw > released.yaw, "explicit same-sign steering remains ordinary authority, stronger than passive carry");

const shallow = seeded({ bank: 0.08 }).step({ throttle: 0, steer: 0 }, 1 / 60);
assert.equal(shallow.yaw, 0, "shallow residual bank creates no live yaw carry");

const slow = seeded({ speed: 18 }).step({ throttle: 0, steer: 0 }, 1 / 60);
assert.equal(slow.yaw, 0, "low-speed flight creates no live yaw carry");

const landing = seeded({ landingRequested: true }).step({ throttle: 0, steer: 0 }, 1 / 60);
assert.equal(landing.yaw, 0, "landing final approach keeps carry disabled");
assert.equal(landing.mode, "landing", "landing mode remains authoritative");

const takeoff = seeded({ takeoffActive: true }).step({ throttle: 0, steer: 0 }, 1 / 60);
assert.equal(takeoff.yaw, 0, "takeoff lift transient keeps carry disabled");
assert.ok(takeoff.velocity.y > 0, "takeoff lift remains authoritative while carry is disabled");

const stalled = seeded({ speed: 6 }).step({ throttle: -1, steer: 0 }, 1 / 60);
assert.equal(stalled.yaw, 0, "stall pressure keeps carry disabled");
assert.ok(stalled.stallFactor > 0, "existing stall recovery remains active");

const decay = seeded({ bank: 0.65 });
let previousYaw = decay.yaw;
let firstDelta = null;
let lateDelta = null;
for (let frame = 0; frame < 40; frame += 1) {
  const snapshot = decay.step({ throttle: 0, steer: 0 }, 1 / 60);
  const delta = snapshot.yaw - previousYaw;
  if (frame === 0) firstDelta = delta;
  if (frame === 20) lateDelta = delta;
  assert.ok(delta >= -1e-12, `carry never reverses itself while the bank decays at frame ${frame}`);
  previousYaw = snapshot.yaw;
}
assert.ok(firstDelta > 0, "bank release begins with measurable carry");
assert.ok(lateDelta >= 0 && lateDelta < firstDelta, "carry fades naturally with the existing bank pose");

const malformed = seeded();
malformed.bank = Number.NaN;
const repaired = malformed.step({ throttle: 0, steer: 0 }, 1 / 60);
assert.ok(Number.isFinite(repaired.yaw), "malformed bank state still repairs to finite yaw");
assert.ok(Number.isFinite(repaired.bank), "malformed bank state still repairs to finite bank");

const longRun = seeded({ speed: 52, bank: 0 });
for (let frame = 0; frame < 60 * 60; frame += 1) {
  const phase = frame % 360;
  const steer = phase < 90 ? 0.6 : phase < 150 ? 0 : phase < 240 ? -0.55 : 0;
  const snapshot = longRun.step({
    throttle: phase < 260 ? 0.25 : 0,
    climb: phase < 120 ? -0.25 : phase < 240 ? 0.2 : 0,
    steer,
  }, 1 / 60);
  assert.ok(Number.isFinite(snapshot.yaw), `finite yaw at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.bank), `finite bank at frame ${frame}`);
  assert.ok(Math.abs(snapshot.bank) < 1, `bounded bank at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.speed), `finite speed at frame ${frame}`);
}

console.log("bank turn carry controller tests passed");
