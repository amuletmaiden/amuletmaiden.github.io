import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const {
  FlightCollisionResolver,
  normalizeSurface,
  sweepSurfaceContact,
} = await importSource("../src/flight/collision.js");
const {
  ChaseCameraRig,
  maximumFiniteHeightAlongSegment,
  normalizeTerrainHeight,
  resolveRecoveryAltitude,
} = await importSource("../src/flight/chase-camera.js");

for (const sample of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
  const normalized = normalizeSurface(sample);
  assert.equal(normalized.valid, false, "missing and non-finite collision samples stay invalid");
  assert.equal(normalized.surface, "unknown");
}

assert.deepEqual(
  normalizeSurface({ height: 18, surface: "terrain", validity: "sparse", id: "edge" }),
  { height: 18, surface: "terrain", id: "edge", valid: true, validity: "sparse" },
  "finite sparse samples remain usable",
);
assert.equal(normalizeSurface({ height: 40, validity: "out-of-bounds" }).valid, false);
assert.equal(normalizeSurface({ height: 40, valid: false }).validity, "out-of-bounds");
assert.equal(normalizeSurface({ height: Number.NaN, validity: "valid" }).validity, "non-finite");

{
  const transition = (x) => {
    if (x < 3) return { height: 0, surface: "terrain", validity: "valid" };
    if (x < 6) return null;
    return { height: 12, surface: "terrain", validity: "sparse" };
  };
  const contact = sweepSurfaceContact(
    { x: 0, y: 20, z: 0 },
    { x: 10, y: 8, z: 0 },
    transition,
    { sweepStep: 0.5, clearance: 2.5 },
  );
  assert.ok(contact, "sweep resumes collision checks after a missing interval");
  assert.equal(contact.surface.validity, "sparse");
  assert.ok(contact.point.x >= 6);
}

{
  const contact = sweepSurfaceContact(
    { x: 0, y: 10, z: 0 },
    { x: 0, y: -10, z: 0 },
    () => ({ height: 0, validity: "out-of-bounds" }),
    { sweepStep: 1 },
  );
  assert.equal(contact, null, "out-of-bounds samples do not become false sea-level collisions");
}

{
  const resolver = new FlightCollisionResolver();
  resolver.reset({ x: 4, y: 90, z: 4 });
  const clear = resolver.resolve({
    previous: { x: 4, y: 90, z: 4 },
    proposed: { x: 8, y: 20, z: 8 },
    velocity: { x: 4, y: -20, z: 4 },
    sampleSurface: () => ({ height: Number.NaN, validity: "non-finite" }),
  });
  assert.equal(clear.collided, false);
  assert.equal(clear.telemetry.terrainValidity, "non-finite");
  assert.equal(clear.surface, "unknown");

  const recovered = resolver.resolve({
    previous: clear.position,
    proposed: { x: Number.NaN, y: 0, z: 0 },
    velocity: { x: 0, y: -1, z: 0 },
    sampleSurface: () => null,
  });
  assert.deepEqual(
    recovered.position,
    { x: 4, y: 90, z: 4 },
    "invalid terrain does not replace the last genuinely safe recovery point",
  );
}

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 8, z: 0 },
    proposed: { x: 0, y: -4, z: 0 },
    velocity: { x: 0, y: -12, z: 0 },
    sampleSurface: () => ({ height: 0, surface: "water", validity: "valid" }),
  });
  assert.equal(result.reason, "water-contact", "explicit valid water still triggers recovery");
}

for (const sample of [
  null,
  undefined,
  Number.NaN,
  { height: 80, validity: "missing" },
  { height: 80, validity: "out-of-bounds" },
  { height: Number.POSITIVE_INFINITY, validity: "valid" },
]) {
  assert.equal(normalizeTerrainHeight(sample), Number.NEGATIVE_INFINITY);
}
assert.equal(normalizeTerrainHeight({ height: 80, validity: "sparse" }), 80);

assert.equal(
  maximumFiniteHeightAlongSegment(
    { x: 0, y: 100, z: 0 },
    { x: 12, y: 100, z: 0 },
    (x) => {
      if (x < 3) return { height: 20, validity: "valid" };
      if (x < 8) return { height: 900, validity: "out-of-bounds" };
      return { height: 65, validity: "sparse" };
    },
    13,
  ),
  65,
  "camera clearance ignores invalid spikes and resumes on sparse finite terrain",
);

assert.equal(
  resolveRecoveryAltitude(
    { x: 5000, y: -20, z: 5000 },
    () => ({ height: 900, validity: "out-of-bounds" }),
    { minimumAltitude: 76, terrainClearance: 30 },
  ),
  76,
  "out-of-bounds recovery uses the conservative floor",
);
assert.equal(
  resolveRecoveryAltitude(
    { x: 4, y: 20, z: 4 },
    () => ({ height: 90, validity: "sparse" }),
    { minimumAltitude: 76, terrainClearance: 30 },
  ),
  120,
  "finite sparse recovery samples retain terrain clearance",
);

{
  const rig = new ChaseCameraRig({ terrainClearance: 6, clearanceSamples: 9 });
  const snapshot = rig.update({
    target: { x: 0, y: 40, z: 0 },
    yaw: 0,
    sampleHeight: (_x, z) => {
      if (z > -8) return { height: 10, validity: "valid" };
      if (z > -18) return { height: 500, validity: "missing" };
      return { height: 70, validity: "sparse" };
    },
  });
  assert.equal(snapshot.obstructed, true);
  assert.ok(snapshot.position.y >= 76, "camera clears the sparse valid boundary sample");
}

console.log("terrain validity transition tests passed");
