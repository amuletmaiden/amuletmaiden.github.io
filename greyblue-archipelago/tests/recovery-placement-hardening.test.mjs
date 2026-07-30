import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/flight/chase-camera.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { ChaseCameraRig, resolveRecoveryAltitude } = await import(moduleUrl);

assert.equal(
  resolveRecoveryAltitude({ x: 10, y: 8, z: 10 }, () => null),
  72,
  "missing sparse terrain uses the conservative recovery floor",
);
assert.equal(
  resolveRecoveryAltitude({ x: 5000, y: -20, z: 5000 }, () => undefined),
  72,
  "out-of-bounds terrain cannot leave recovery below the safe floor",
);
assert.equal(
  resolveRecoveryAltitude({ x: 0, y: 40, z: 0 }, () => 120),
  156,
  "sampled terrain adds recovery flight clearance",
);
assert.equal(
  resolveRecoveryAltitude({ x: 0, y: 220, z: 0 }, () => 120),
  220,
  "a higher valid recovery altitude is preserved",
);
assert.equal(
  resolveRecoveryAltitude({ x: 0, y: 20, z: 0 }, () => ({ height: 90, surface: "terrain" })),
  126,
  "surface objects are accepted without numeric coercion",
);

{
  const rig = new ChaseCameraRig({ recoveryMinimumAltitude: 80, recoveryClearance: 30, terrainClearance: 6 });
  const initialTarget = { x: 0, y: 140, z: 0 };
  rig.update({ target: initialTarget, yaw: 0, sampleHeight: () => 110 });

  const recovered = { x: 0, y: 12, z: 0 };
  const snapshot = rig.snapTo(recovered, 0);
  assert.equal(recovered.y, 140, "snapTo raises the live recovered position using the remembered sampler");
  assert.ok(snapshot.position.y >= 146, "recovery camera clears sampled terrain immediately");
  assert.ok(snapshot.lookTarget.y > recovered.y, "recovery camera keeps a valid look target above the dragon");
}

{
  const rig = new ChaseCameraRig({ recoveryMinimumAltitude: 76, recoveryClearance: 32 });
  rig.update({ target: { x: 0, y: 100, z: 0 }, sampleHeight: () => null });
  const recovered = { x: 9000, y: -100, z: 9000 };
  const snapshot = rig.snapTo(recovered, Math.PI / 2);
  assert.equal(recovered.y, 76, "sparse or out-of-bounds recovery still raises the live position");
  assert.ok(Number.isFinite(snapshot.position.y));
  assert.ok(snapshot.position.y >= recovered.y, "camera remains above the conservative recovery placement");
}

console.log("recovery placement hardening tests passed");
