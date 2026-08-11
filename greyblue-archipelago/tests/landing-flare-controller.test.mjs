import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { TAKEOFF_LIFT_DURATION } from "../src/flight/takeoff-lift.js";

function landingSeed(verticalVelocity = -6.5) {
  const controller = new FlightController();
  controller.airborne = true;
  controller.landingRequested = true;
  controller.velocity = { x: 0, y: verticalVelocity, z: 14 };
  controller.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  return controller;
}

const neutral = landingSeed().step({ throttle: 0, climb: 0 }, 1 / 60);
const flared = landingSeed().step({ throttle: 0, climb: 1 }, 1 / 60);
assert.equal(neutral.mode, "landing", "neutral approach remains in landing mode");
assert.equal(flared.mode, "landing", "flare remains committed to landing mode");
assert.ok(flared.velocity.y > neutral.velocity.y, "positive climb softens the committed descent immediately");
assert.ok(flared.velocity.y < 0, "full flare remains descending rather than becoming a climb");

const harder = landingSeed().step({ throttle: 0, climb: -1 }, 1 / 60);
assert.ok(harder.velocity.y < neutral.velocity.y, "negative climb keeps stronger descent authority");

const partial = landingSeed().step({ throttle: 0, climb: 0.5 }, 1 / 60);
assert.ok(partial.velocity.y > neutral.velocity.y, "partial positive climb produces a partial flare");
assert.ok(partial.velocity.y < flared.velocity.y, "partial flare stays weaker than full flare");

const goAround = landingSeed();
const goAroundSnapshot = goAround.step({ toggleFlight: true, throttle: 0.4, climb: 1 }, 1 / 60);
assert.equal(goAroundSnapshot.landingRequested, false, "go-around cancels landing before vertical composition");
assert.notEqual(goAroundSnapshot.mode, "landing", "go-around leaves landing mode");
assert.ok(goAroundSnapshot.velocity.y > flared.velocity.y, "go-around restores ordinary climb authority instead of remaining flare-limited");
assert.equal(goAround.takeoffLiftElapsed, TAKEOFF_LIFT_DURATION, "go-around does not rearm takeoff lift");

const launch = new FlightController();
const launchSnapshot = launch.step({ toggleFlight: true, climb: 1 }, 1 / 60);
assert.equal(launchSnapshot.landingRequested, false, "grounded launch is not a landing flare");
assert.ok(launchSnapshot.velocity.y > 0, "existing takeoff lift remains authoritative");
assert.ok(launch.takeoffLiftElapsed < TAKEOFF_LIFT_DURATION, "existing takeoff transient remains active");

const ground = new FlightController();
ground.velocity.y = -7;
const groundSnapshot = ground.step({ climb: 1 }, 1 / 60);
assert.equal(groundSnapshot.airborne, false, "grounded state remains grounded");
assert.equal(groundSnapshot.velocity.y, 0, "grounded climb input cannot synthesize vertical motion");

const malformed = landingSeed();
malformed.velocity.y = Number.NaN;
const repaired = malformed.step({ climb: 1 }, 1 / 60);
assert.ok(Number.isFinite(repaired.velocity.y), "non-finite landing state still reaches existing finite repair");
assert.ok(Number.isFinite(repaired.speed), "repair preserves finite public flight state");

const sustained = landingSeed(-4);
let latest = sustained.snapshot();
for (let frame = 0; frame < 60 * 30; frame += 1) {
  const phase = frame % 180;
  latest = sustained.step({
    throttle: phase < 120 ? 0 : -0.4,
    climb: phase < 60 ? 0.85 : phase < 120 ? 0 : -0.35,
    steer: phase < 90 ? 0.2 : -0.15,
  }, 1 / 60);
  assert.equal(latest.mode, "landing", `landing commitment remains truthful at frame ${frame}`);
  assert.ok(Number.isFinite(latest.velocity.y), `finite landing vertical velocity at frame ${frame}`);
  assert.ok(Number.isFinite(latest.speed), `finite landing speed at frame ${frame}`);
  assert.ok(latest.velocity.y <= 0.01, `flare never turns the committed landing into sustained climb at frame ${frame}`);
}

console.log("landing flare controller tests passed");
