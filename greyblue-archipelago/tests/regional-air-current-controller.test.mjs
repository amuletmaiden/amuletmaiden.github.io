import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";
import { regionalAirCurrentForRegion } from "../src/world/regional-air-current-metadata.js";

const neutralInput = Object.freeze({ throttle: 0.5, steer: 0, climb: 0, toggleFlight: false });

function cruisingController() {
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: 0, z: 34 };
  return controller;
}

{
  const calm = cruisingController();
  const windy = cruisingController();
  windy.setEnvironmentPlanarCurrent(regionalAirCurrentForRegion("mothwater"));
  for (let index = 0; index < 120; index += 1) {
    calm.step(neutralInput, 1 / 60);
    windy.step(neutralInput, 1 / 60);
  }
  assert(windy.velocity.x > calm.velocity.x + 1.5, "authored current should create readable bounded track drift");
  assert(Math.abs(windy.yaw - calm.yaw) < 1e-12, "regional current must not steer the dragon");
  assert(Math.abs(windy.velocity.y - calm.velocity.y) < 1e-12, "regional current must not alter vertical flight");
}

{
  const controller = cruisingController();
  controller.setEnvironmentPlanarCurrent({ x: 999, z: 0 });
  for (let index = 0; index < 180; index += 1) controller.step(neutralInput, 1 / 60);
  assert(controller.velocity.x <= 4.21, "controller integration must retain the 4.2-unit current cap");
  assert(Number.isFinite(controller.velocity.x) && Number.isFinite(controller.velocity.z));
}

{
  const controller = cruisingController();
  controller.setEnvironmentPlanarCurrent({ x: 4.2, z: 0 });
  controller.landingRequested = true;
  const before = controller.velocity.x;
  for (let index = 0; index < 30; index += 1) controller.step(neutralInput, 1 / 60);
  assert(controller.velocity.x <= before + 1e-9, "landing must suppress environmental track drift");
}

{
  const controller = new FlightController();
  controller.setEnvironmentPlanarCurrent({ x: 4.2, z: 0 });
  controller.step({ ...neutralInput, toggleFlight: true }, 1 / 60);
  assert.equal(controller.velocity.x, 0, "takeoff release must suppress regional current");
}

{
  const controller = cruisingController();
  controller.setEnvironmentPlanarCurrent({ x: Number.NaN, z: 4 });
  controller.step(neutralInput, 1 / 60);
  assert.equal(controller.environmentPlanarCurrent.x, 0);
  assert.equal(controller.environmentPlanarCurrent.z, 0);
}

for (const regionId of [
  "hushed-reach",
  "drowned-crown",
  "blueglass-wake",
  "widow-current",
  "mothwater",
  "far-choir",
]) {
  const current = regionalAirCurrentForRegion(regionId);
  assert(Number.isFinite(current.x) && Number.isFinite(current.z), `${regionId} current must be finite`);
  assert(Math.hypot(current.x, current.z) <= 4.2, `${regionId} current must fit the controller cap`);
  assert(Object.isFrozen(current), `${regionId} current must be immutable`);
}
assert.deepEqual(regionalAirCurrentForRegion("unknown-region"), { x: 0, z: 0 });

console.log(JSON.stringify({ status: "pass", regions: 6, maxCurrent: 4.2 }));
