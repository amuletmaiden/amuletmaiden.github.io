import assert from "node:assert/strict";
import { ChaseCameraRig } from "../src/flight/chase-camera.js";
import { FreeLookChaseCamera } from "../src/flight/camera-free-look-integration.js";

function finite(snapshot) {
  return [snapshot.position.x, snapshot.position.y, snapshot.position.z,
    snapshot.lookTarget.x, snapshot.lookTarget.y, snapshot.lookTarget.z, snapshot.distance].every(Number.isFinite);
}

function settle(rig, frame, frames = 120) {
  let state;
  for (let index = 0; index < frames; index += 1) state = rig.update(frame);
  return state;
}

const fastLowFrame = {
  target: { x: 0, y: 28, z: 0 },
  yaw: 0,
  bank: 0.15,
  speed: 58,
  grounded: false,
  dt: 1 / 60,
  sampleHeight: () => 4,
};

{
  const low = settle(new ChaseCameraRig(), fastLowFrame);
  const high = settle(new ChaseCameraRig(), { ...fastLowFrame, target: { x: 0, y: 120, z: 0 } });
  assert.ok(low.position.z > high.position.z, "fast low flight contracts chase distance relative to high cruise");
  assert.ok(low.lookTarget.z > high.lookTarget.z, "fast low flight modestly extends look-ahead");
  assert.ok(finite(low) && finite(high));
}

{
  const ordinary = settle(new ChaseCameraRig(), fastLowFrame);
  const reduced = settle(new ChaseCameraRig(), { ...fastLowFrame, reducedMotion: true });
  const high = settle(new ChaseCameraRig(), { ...fastLowFrame, target: { x: 0, y: 120, z: 0 } });
  assert.ok(reduced.position.z < ordinary.position.z, "reduced motion contracts the low-flight camera excursion");
  assert.ok(reduced.position.z > high.position.z, "reduced motion retains a restrained low-flight readback");
}

{
  const blocked = settle(new ChaseCameraRig({ terrainClearance: 7 }), {
    ...fastLowFrame,
    target: { x: 0, y: 30, z: 0 },
    sampleHeight: () => 80,
  }, 30);
  assert.equal(blocked.obstructed, true, "existing obstruction truth remains authoritative");
  assert.ok(blocked.position.y >= 87, "ground rush cannot defeat terrain clearance");
}

{
  const grounded = settle(new ChaseCameraRig(), { ...fastLowFrame, grounded: true });
  assert.ok(finite(grounded), "grounded settle remains finite with low terrain beneath it");
  const airborne = settle(new ChaseCameraRig(), fastLowFrame);
  assert.ok(grounded.position.z > airborne.position.z, "grounded settle remains a distinct stronger contraction than airborne ground rush");
}

{
  const camera = new FreeLookChaseCamera(new ChaseCameraRig());
  let state;
  for (let index = 0; index < 120; index += 1) {
    state = camera.update({ ...fastLowFrame, lookX: index < 30 ? 0.7 : 0, lookY: index < 30 ? -0.2 : 0 });
  }
  assert.ok(finite(state), "free-look and ground-rush composition remain finite together");
  assert.ok(state.freeLook && typeof state.freeLook.active === "boolean", "free-look remains the observation owner");
}

{
  const rig = new ChaseCameraRig();
  settle(rig, fastLowFrame);
  rig.snapTo({ x: 0, y: 100, z: 0 }, 0, () => 0);
  const recovered = settle(rig, { ...fastLowFrame, target: { x: 0, y: 120, z: 0 } }, 30);
  const fresh = settle(new ChaseCameraRig(), { ...fastLowFrame, target: { x: 0, y: 120, z: 0 } }, 30);
  assert.ok(Math.abs(recovered.position.z - fresh.position.z) < 0.75, "recovery leaves no hidden ground-rush state");
}

{
  const rig = new ChaseCameraRig();
  let snapshot;
  for (let frame = 0; frame < 60 * 60; frame += 1) {
    snapshot = rig.update({
      target: { x: Math.sin(frame / 90) * 200, y: 30 + Math.sin(frame / 70) * 24, z: Math.cos(frame / 90) * 200 },
      yaw: frame / 120,
      bank: Math.sin(frame / 25) * 0.6,
      speed: 42 + Math.sin(frame / 31) * 24,
      grounded: false,
      reducedMotion: frame % 900 > 700,
      dt: 1 / 60,
      sampleHeight: (x, z) => 4 + Math.sin(x / 80) * 3 + Math.cos(z / 90) * 3,
    });
    assert.ok(finite(snapshot), `finite low-flight camera at frame ${frame}`);
  }
}

console.log("ground-rush camera integration: ok");
