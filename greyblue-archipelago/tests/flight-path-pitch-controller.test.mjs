import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function seeded({ speed = 34, vertical = 8, pitch = 0, landingRequested = false, takeoffActive = false } = {}) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: vertical, z: speed };
  controller.pitch = pitch;
  controller.landingRequested = landingRequested;
  controller.takeoffLiftElapsed = takeoffActive ? 0 : TAKEOFF_LIFT_DURATION;
  return controller;
}

const ascent = seeded({ vertical: 9 }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(ascent.pitch > 0, "neutral input retains a readable nose-up attitude while the dragon is still ascending");
assert.ok(ascent.velocity.y > 0, "the pose contribution does not erase genuine ascent momentum");

const descent = seeded({ vertical: -9 }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(descent.pitch < 0, "neutral input retains a readable nose-down attitude while the dragon is still descending");
assert.ok(descent.velocity.y < 0, "the pose contribution does not erase genuine descent momentum");

const level = seeded({ vertical: 0 }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(Math.abs(level.pitch) < 0.01, "level neutral flight remains effectively level");

const oppositeDive = seeded({ vertical: 10 }).step({ throttle: 0, steer: 0, climb: -0.6 }, 1 / 60);
assert.ok(oppositeDive.pitch < 0, "explicit dive input remains authoritative over residual climb trajectory");

const oppositeClimb = seeded({ vertical: -10 }).step({ throttle: 0, steer: 0, climb: 0.6 }, 1 / 60);
assert.ok(oppositeClimb.pitch > 0, "explicit climb input remains authoritative over residual descent trajectory");

const landing = seeded({ vertical: 8, landingRequested: true }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(landing.pitch < 0, "landing-request nose-down readability remains authoritative");
assert.equal(landing.mode, "landing", "landing mode remains unchanged");

const takeoff = seeded({ vertical: 6, takeoffActive: true }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(takeoff.velocity.y > 6, "bounded takeoff lift remains authoritative");
assert.ok(Math.abs(takeoff.pitch) < 0.01, "takeoff transient does not receive extra flight-path pose bias");

const slow = seeded({ speed: 6, vertical: 5 }).step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(slow.stallFactor > 0.35, "low-speed stall cue remains present");
assert.ok(slow.pitch <= 0, "stall pose remains authoritative over climb-path carry");

const malformed = seeded();
malformed.velocity.y = Number.NaN;
const repaired = malformed.step({ throttle: 0, steer: 0, climb: 0 }, 1 / 60);
assert.ok(Number.isFinite(repaired.pitch), "malformed vertical state repairs to finite pitch");
assert.ok(Number.isFinite(repaired.velocity.y), "malformed vertical state repairs to finite velocity");

const longRun = seeded({ speed: 42, vertical: 0 });
for (let frame = 0; frame < 60 * 60; frame += 1) {
  const phase = frame % 300;
  const climb = phase < 75 ? 0.55 : phase < 150 ? 0 : phase < 225 ? -0.5 : 0;
  const snapshot = longRun.step({ throttle: 0.2, steer: 0.15, climb }, 1 / 60);
  assert.ok(Number.isFinite(snapshot.pitch), `finite pitch at frame ${frame}`);
  assert.ok(Number.isFinite(snapshot.velocity.y), `finite vertical velocity at frame ${frame}`);
  assert.ok(Math.abs(snapshot.pitch) <= 0.42 + 1e-12, `pitch clamp preserved at frame ${frame}`);
}

console.log("flight-path pitch controller tests passed");
