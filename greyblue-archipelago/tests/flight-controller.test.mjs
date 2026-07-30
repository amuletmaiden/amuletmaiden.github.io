import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/flight/controller.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { FlightController } = await import(moduleUrl);

function finite(snapshot) {
  return [
    snapshot.velocity.x,
    snapshot.velocity.y,
    snapshot.velocity.z,
    snapshot.speed,
    snapshot.yaw,
    snapshot.pitch,
    snapshot.bank,
    snapshot.stallFactor,
  ].every(Number.isFinite);
}

{
  const controller = new FlightController();
  controller.step({ toggleFlight: true }, 1 / 60);
  assert.equal(controller.airborne, true, "takeoff enters flight");
  assert.ok(controller.velocity.y > 0, "takeoff produces lift");

  for (let frame = 0; frame < 60 * 90; frame += 1) {
    const phase = frame % 480;
    const snapshot = controller.step({
      throttle: phase < 240 ? 1 : -0.65,
      steer: phase < 120 ? 1 : phase < 360 ? -1 : 0.5,
      climb: phase < 160 ? 0.8 : phase < 320 ? -0.7 : 0,
    }, 1 / 60);
    assert.ok(finite(snapshot), `finite state at frame ${frame}`);
    assert.ok(snapshot.speed < 80, `bounded planar speed at frame ${frame}`);
    assert.ok(Math.abs(snapshot.velocity.y) <= 24, `bounded vertical speed at frame ${frame}`);
  }
}

{
  const controller = new FlightController();
  controller.step({ toggleFlight: true }, 1 / 60);
  for (let i = 0; i < 240; i += 1) controller.step({ throttle: 1 }, 1 / 60);
  const beforeTurn = controller.snapshot();
  for (let i = 0; i < 360; i += 1) controller.step({ throttle: 1, steer: 1 }, 1 / 60);
  const afterTurn = controller.snapshot();
  assert.ok(afterTurn.speed < 80, "hard turn does not inject runaway energy");
  assert.notEqual(afterTurn.yaw, beforeTurn.yaw, "hard turn changes heading");
}

{
  const controller = new FlightController();
  const position = { x: 0, y: 15, z: 0 };
  controller.step({ toggleFlight: true }, 1 / 60);
  controller.step({ toggleFlight: true }, 1 / 60);
  assert.equal(controller.landingRequested, true, "airborne toggle requests landing");
  for (let i = 0; i < 300; i += 1) {
    const snapshot = controller.step({ throttle: -1, climb: -1 }, 1 / 60);
    position.y += snapshot.velocity.y / 60;
    controller.resolveGround(position, 2.5);
    if (!controller.airborne) break;
  }
  assert.equal(controller.airborne, false, "landing settles on terrain");
  controller.step({ toggleFlight: true }, 1 / 60);
  assert.equal(controller.airborne, true, "landed dragon can relaunch");
}

{
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: 0, y: -6, z: 0 };
  let snapshot = controller.snapshot();
  assert.equal(snapshot.mode, "recovery", "zero-airflow flight begins stalled");
  for (let i = 0; i < 360; i += 1) {
    snapshot = controller.step({ throttle: -1, climb: 0 }, 1 / 60);
  }
  assert.ok(snapshot.speed >= 10.5, "stall recovery regains flying speed despite reverse throttle");
  assert.ok(snapshot.stallFactor < 0.2, "stall pressure relaxes after airflow returns");
  assert.notEqual(snapshot.mode, "recovery", "controller exits recovery mode");
}

{
  const controller = new FlightController();
  controller.airborne = true;
  controller.velocity = { x: Number.POSITIVE_INFINITY, y: NaN, z: 1 };
  const recovered = controller.step({}, 1 / 60);
  assert.ok(finite(recovered), "non-finite state repairs itself");
  assert.equal(recovered.mode, "recovery");
}

console.log("flight-controller tests passed");
