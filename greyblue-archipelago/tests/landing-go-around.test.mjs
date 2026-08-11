import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";

const controller = new FlightController();
controller.step({ toggleFlight: true }, 1 / 60);
for (let i = 0; i < 90; i += 1) controller.step({ throttle: 1 }, 1 / 60);

const landing = controller.step({ toggleFlight: true, throttle: 1 }, 1 / 60);
assert.equal(landing.landingRequested, true, "first airborne toggle requests landing");
assert.equal(landing.mode, "landing", "landing request remains publicly legible");
const landingVertical = landing.velocity.y;

const goAround = controller.step({ toggleFlight: true, throttle: 1, climb: 1 }, 1 / 60);
assert.equal(goAround.landingRequested, false, "second airborne toggle cancels landing");
assert.notEqual(goAround.mode, "landing", "go-around returns to ordinary flight mode");
assert.ok(goAround.velocity.y > landingVertical, "ordinary climb authority resumes on the cancellation frame");
assert.ok(controller.takeoffLiftElapsed > 0.45, "airborne go-around does not arm grounded takeoff lift");

const secondLanding = controller.step({ toggleFlight: true }, 1 / 60);
assert.equal(secondLanding.landingRequested, true, "landing can be requested again after a go-around");
const secondGoAround = controller.step({ toggleFlight: true }, 1 / 60);
assert.equal(secondGoAround.landingRequested, false, "repeated go-around remains explicit and reversible");

controller.step({ toggleFlight: true }, 1 / 60);
const position = { x: 0, y: 0, z: 0 };
controller.resolveGround(position, 0);
assert.equal(controller.airborne, false, "truthful landing still settles through ground resolution");
const relaunch = controller.step({ toggleFlight: true }, 1 / 60);
assert.equal(relaunch.airborne, true, "grounded toggle still relaunches");
assert.ok(relaunch.velocity.y > 0, "grounded relaunch still receives bounded takeoff lift");

console.log("landing go-around tests passed");
