import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/flight/chase-camera.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { ChaseCameraRig } = await import(moduleUrl);

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
  const rig = new ChaseCameraRig();
  const repaired = rig.update({
    target: { x: Infinity, y: NaN, z: 0 },
    yaw: Infinity,
    bank: NaN,
    speed: Infinity,
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
      dt: 1 / 60,
      sampleHeight: (x, z) => 20 + Math.sin(x / 140) * 15 + Math.cos(z / 170) * 12,
    });
    assert.ok(finite(snapshot), `finite camera at frame ${frame}`);
  }
}

console.log("chase-camera tests passed");
