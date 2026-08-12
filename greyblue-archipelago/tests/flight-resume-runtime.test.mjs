import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { applyFlightResume, captureFlightResume } from "../src/core/flight-resume-runtime.js";

{
  const controller = new FlightController();
  const applied = applyFlightResume(controller, {
    yaw: Math.PI * 2.5,
    velocity: { x: 90, y: -30, z: 0 },
    airborne: true,
    landingRequested: true,
  });
  assert.equal(applied, true);
  assert.ok(Math.abs(controller.yaw - Math.PI / 2) < 1e-9);
  assert.deepEqual(controller.velocity, { x: 72, y: -24, z: 0 });
  assert.equal(controller.airborne, true);
  assert.equal(controller.landingRequested, true);
}

{
  const controller = new FlightController();
  controller.yaw = -1.2;
  controller.velocity = { x: 18, y: 4, z: 23 };
  controller.airborne = true;
  controller.landingRequested = false;
  const captured = captureFlightResume(controller);
  assert.deepEqual(captured, {
    yaw: -1.2,
    velocity: { x: 18, y: 4, z: 23 },
    airborne: true,
    landingRequested: false,
  });
  captured.velocity.x = 999;
  assert.equal(controller.velocity.x, 18, "capture must not alias live controller velocity");
}

{
  const controller = new FlightController();
  applyFlightResume(controller, {
    yaw: 1.8,
    velocity: { x: 30, y: -8, z: 15 },
    airborne: false,
    landingRequested: true,
  });
  assert.equal(controller.yaw, 1.8);
  assert.deepEqual(controller.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(controller.airborne, false);
  assert.equal(controller.landingRequested, false, "grounded resume must discard stale landing request");
}

{
  const controller = new FlightController();
  applyFlightResume(controller, null);
  assert.deepEqual(captureFlightResume(controller), {
    yaw: 0,
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    landingRequested: false,
  });
}

console.log("flight-resume-runtime tests passed");
