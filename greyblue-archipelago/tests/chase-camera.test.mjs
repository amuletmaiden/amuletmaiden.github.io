import assert from "node:assert/strict";
import { ChaseCameraRig } from "../src/flight/chase-camera.js";

function finite(snapshot) {
  return [
    snapshot.position.x,
    snapshot.position.y,
    snapshot.position.z,
    snapshot.lookTarget.x,
    snapshot.lookTarget.y,
    snapshot.lookTarget.z,
    snapshot.distance,
  ].every(Number.isFinite);
}

{
  const rig = new ChaseCameraRig();
  const first = rig.update({ target: { x: 0, y: 100, z: 0 }, yaw: 0, speed: 0 });
  assert.ok(finite(first));
  assert.ok(first.position.z < 0, "camera begins behind forward-facing dragon");
  const next = rig.update({ target: { x: 20, y: 100, z: 40 }, yaw: Math.PI / 2, speed: 50, dt: 1 / 60 });
  assert.ok(finite(next));
  assert.notDeepEqual(next.position, first.position, "camera follows a moving dragon");
  assert.ok(next.position.x < 20, "camera trails new heading rather than snapping through target");
}

{
  const rig = new ChaseCameraRig({ terrainClearance: 7 });
  const blocked = rig.update({
    target: { x: 0, y: 30, z: 0 },
    yaw: 0,
    sampleHeight: () => 80,
  });
  assert.equal(blocked.obstructed, true);
  assert.ok(blocked.position.y >= 87, "camera rises above terrain obstruction");
  const clear = rig.update({
    target: { x: 0, y: 100, z: 0 },
    yaw: 0,
    dt: 0.1,
    sampleHeight: () => 0,
  });
  assert.equal(clear.obstructed, false);
  assert.ok(finite(clear));
}

{
  const rig = new ChaseCameraRig();
  const slow = rig.update({ target: { x: 0, y: 100, z: 0 }, yaw: 0, speed: 0 });
  const fastRig = new ChaseCameraRig();
  const fast = fastRig.update({ target: { x: 0, y: 100, z: 0 }, yaw: 0, speed: 80 });
  assert.ok(fast.position.z < slow.position.z, "high-speed flight stretches chase distance");
  assert.ok(fast.lookTarget.z > slow.lookTarget.z, "high-speed flight increases look-ahead");
}

{
  const airborneRig = new ChaseCameraRig();
  const groundedRig = new ChaseCameraRig();
  const frame = {
    target: { x: 0, y: 100, z: 0 },
    yaw: 0,
    bank: 0.7,
    speed: 80,
    dt: 1 / 60,
    sampleHeight: () => 0,
  };
  for (let index = 0; index < 90; index += 1) {
    airborneRig.update({ ...frame, grounded: false });
    groundedRig.update({ ...frame, grounded: true });
  }
  const airborne = airborneRig.snapshot();
  const grounded = groundedRig.snapshot();
  assert.ok(grounded.position.z > airborne.position.z, "sustained grounded truth contracts residual speed stretch");
  assert.ok(grounded.position.y < airborne.position.y, "sustained grounded truth settles camera height");
  assert.ok(grounded.lookTarget.z < airborne.lookTarget.z, "sustained grounded truth contracts look-ahead");
  assert.ok(Math.abs(grounded.position.x) < Math.abs(airborne.position.x), "sustained grounded truth damps bank offset");
}

{
  const rig = new ChaseCameraRig();
  const frame = {
    target: { x: 0, y: 100, z: 0 },
    yaw: 0,
    bank: 0.7,
    speed: 80,
    dt: 1 / 60,
    sampleHeight: () => 0,
  };
  const first = rig.update({ ...frame, grounded: false });
  const firstGrounded = rig.update({ ...frame, grounded: true });
  assert.ok(Math.abs(firstGrounded.position.z - first.position.z) < 1, "first grounded frame remains continuous");
  for (let index = 0; index < 60; index += 1) rig.update({ ...frame, grounded: true });
  const settled = rig.snapshot();
  for (let index = 0; index < 60; index += 1) rig.update({ ...frame, grounded: false });
  const released = rig.snapshot();
  assert.ok(released.position.z < settled.position.z, "airborne truth releases toward ordinary chase distance");
}

{
  const rig = new ChaseCameraRig({ terrainClearance: 7 });
  for (let index = 0; index < 60; index += 1) {
    rig.update({
      target: { x: 0, y: 30, z: 0 },
      yaw: 0,
      bank: 0.7,
      speed: 80,
      grounded: true,
      dt: 1 / 60,
      sampleHeight: () => 80,
    });
  }
  const blockedGrounded = rig.snapshot();
  assert.equal(blockedGrounded.obstructed, true);
  assert.ok(blockedGrounded.position.y >= 87, "grounded settle never defeats terrain clearance");
}

{
  const rig = new ChaseCameraRig();
  const frame = {
    target: { x: 0, y: 100, z: 0 },
    yaw: 0,
    bank: 0.7,
    speed: 80,
    dt: 1 / 60,
    sampleHeight: () => 0,
  };
  for (let index = 0; index < 60; index += 1) rig.update({ ...frame, grounded: true });
  rig.snapTo({ x: 0, y: 100, z: 0 }, 0, () => 0);
  const afterRecovery = rig.update({ ...frame, grounded: false });
  const fresh = new ChaseCameraRig().update({ ...frame, grounded: false });
  assert.ok(Math.abs(afterRecovery.position.z - fresh.position.z) < 0.5, "recovery snap clears grounded-settle history");
}

{
  const rig = new ChaseCameraRig();
  const repaired = rig.update({
    target: { x: Infinity, y: NaN, z: 0 },
    yaw: Infinity,
    bank: NaN,
    speed: Infinity,
    grounded: "yes",
    dt: Infinity,
    sampleHeight: () => NaN,
  });
  assert.ok(finite(repaired), "non-finite input repairs to a safe camera state");
}

{
  const rig = new ChaseCameraRig();
  let snapshot;
  for (let frame = 0; frame < 60 * 60; frame += 1) {
    snapshot = rig.update({
      target: {
        x: Math.sin(frame / 90) * 500,
        y: 120 + Math.sin(frame / 45) * 80,
        z: Math.cos(frame / 90) * 500,
      },
      yaw: frame / 120,
      bank: Math.sin(frame / 25) * 0.7,
      speed: 20 + Math.sin(frame / 40) * 18,
      grounded: false,
      dt: 1 / 60,
      sampleHeight: (x, z) => 20 + Math.sin(x / 140) * 15 + Math.cos(z / 170) * 12,
    });
    assert.ok(finite(snapshot), `finite camera at frame ${frame}`);
  }
}

console.log("chase-camera tests passed");
