import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const lookSource = await readFile(new URL("../src/flight/camera-free-look.js", import.meta.url), "utf8");
const lookUrl = `data:text/javascript;base64,${Buffer.from(lookSource).toString("base64")}`;
let integrationSource = await readFile(new URL("../src/flight/camera-free-look-integration.js", import.meta.url), "utf8");
integrationSource = integrationSource.replace('"./camera-free-look.js"', `"${lookUrl}"`);
const integrationUrl = `data:text/javascript;base64,${Buffer.from(integrationSource).toString("base64")}`;
const { FreeLookChaseCamera } = await import(integrationUrl);

function fakeRig() {
  return {
    distance: 24,
    last: null,
    update(input) {
      this.last = structuredClone(input);
      return {
        position: { x: 0, y: 12, z: -24 },
        lookTarget: { x: 0, y: 4, z: 10 },
        obstructed: false,
        distance: 36,
      };
    },
    snapTo(target, yaw) {
      this.last = { target: { ...target }, yaw, snapped: true };
      return {
        position: { x: 0, y: 12, z: -24 },
        lookTarget: { x: 0, y: 4, z: 10 },
        obstructed: false,
        distance: 36,
      };
    },
    snapshot() {
      return {
        position: { x: 0, y: 12, z: -24 },
        lookTarget: { x: 0, y: 4, z: 10 },
        obstructed: false,
        distance: 36,
      };
    },
  };
}

{
  const rig = fakeRig();
  const camera = new FreeLookChaseCamera(rig);
  const state = camera.update({ target: { x: 1, y: 2, z: 3 }, yaw: 0.4, lookX: 1, dt: 0.05 });
  assert.ok(rig.last.yaw > 0.4, "look yaw composes only into camera yaw");
  assert.equal(rig.last.target.x, 1, "target position passes through unchanged");
  assert.equal(state.freeLook.active, true);
  assert.equal(state.freeLook.direction, "right");
}

{
  const rig = fakeRig();
  const camera = new FreeLookChaseCamera(rig);
  const base = camera.update({ yaw: 0.3, dt: 0.05 });
  const looked = camera.update({ yaw: 0.3, lookY: 1, dt: 0.05 });
  assert.equal(rig.last.yaw, 0.3, "pitch look does not alter trajectory yaw input");
  assert.ok(looked.lookTarget.y > base.lookTarget.y, "pitch look changes only returned camera look target");
}

{
  const rig = fakeRig();
  const camera = new FreeLookChaseCamera(rig);
  camera.update({ yaw: 0.2, lookX: 1, lookY: -1, dt: 0.05 });
  const interrupted = camera.update({ yaw: 0.2, lookX: 1, dt: 0.05, interrupted: true });
  assert.equal(rig.last.yaw, 0.2, "interruption clears yaw offset before chase composition");
  assert.deepEqual(interrupted.freeLook, { active: false, direction: null });
}

{
  const rig = fakeRig();
  const camera = new FreeLookChaseCamera(rig);
  camera.update({ yaw: 0, lookX: 1, dt: 0.05 });
  const snapped = camera.snapTo({ x: 2, y: 100, z: 5 }, 0.7);
  assert.equal(rig.last.yaw, 0.7);
  assert.deepEqual(snapped.freeLook, { active: false, direction: null }, "recovery snap clears transient look");
}

{
  const rig = fakeRig();
  const camera = new FreeLookChaseCamera(rig);
  camera.distance = 31;
  assert.equal(camera.distance, 31, "existing camera-distance preference remains owned by chase rig");
}

console.log("camera free-look integration tests passed");
