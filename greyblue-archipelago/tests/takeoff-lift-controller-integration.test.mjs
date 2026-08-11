import assert from "node:assert/strict";
import { FlightController } from "../src/flight/controller.js";

{
  const controller = new FlightController();
  const first = controller.step({ toggleFlight: true }, 1 / 60);
  assert.equal(first.airborne, true, "takeoff enters ordinary flight");
  assert.ok(first.velocity.y > 0, "takeoff begins with upward motion");
  assert.ok(first.velocity.y < 3, "takeoff no longer injects the old one-frame vertical pop");

  let peak = first.velocity.y;
  for (let frame = 0; frame < 20; frame += 1) {
    const snapshot = controller.step({}, 1 / 60);
    peak = Math.max(peak, snapshot.velocity.y);
  }
  assert.ok(peak > first.velocity.y, "bounded release builds useful ground-clearance authority");
}

{
  const controller = new FlightController();
  const first = controller.step({ toggleFlight: true, climb: -1 }, 1 / 60);
  assert.ok(first.velocity.y > 0, "held dive cannot cancel the initial takeoff release");

  for (let frame = 0; frame < 45; frame += 1) controller.step({ climb: -1 }, 1 / 60);
  const released = controller.step({ climb: -1 }, 1 / 60);
  assert.ok(released.velocity.y < 0, "dive regains ordinary authority after the bounded release expires");
}

{
  const controller = new FlightController();
  controller.step({ toggleFlight: true }, 1 / 60);
  controller.step({ toggleFlight: true }, 1 / 60);
  assert.equal(controller.landingRequested, true, "airborne toggle still requests landing");

  const position = { x: 0, y: 0, z: 0 };
  controller.resolveGround(position, 0);
  assert.equal(controller.airborne, false, "ground resolution still settles a requested landing");

  const relaunched = controller.step({ toggleFlight: true }, 1 / 60);
  assert.ok(relaunched.velocity.y > 0, "a fresh grounded takeoff rearms bounded lift");
  assert.ok(relaunched.velocity.y < 3, "relaunch also avoids a one-frame pop");
}

{
  const controller = new FlightController();
  controller.airborne = true;
  controller.takeoffLiftElapsed = Number.NaN;
  const repaired = controller.step({}, 1 / 60);
  assert.ok(Number.isFinite(repaired.velocity.y), "non-finite transient history repairs safely");
  assert.equal(controller.takeoffLiftElapsed > 0, true, "repair clears takeoff transient instead of rearming it");
}

console.log("takeoff lift controller integration tests passed");
