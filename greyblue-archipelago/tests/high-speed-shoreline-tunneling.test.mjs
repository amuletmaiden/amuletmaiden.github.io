import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const {
  FlightCollisionResolver,
  sweepSurfaceContact,
} = await importSource("../src/flight/collision.js");
const {
  ChaseCameraRig,
  maximumFiniteHeightAlongSegment,
  resolveRecoveryAltitude,
} = await importSource("../src/flight/chase-camera.js");

{
  const narrowShore = (x) => x >= -0.35 && x <= 0.35
    ? { height: 3, surface: "terrain", validity: "sparse", id: "narrow-shore" }
    : { height: 0, surface: "water", validity: "valid", id: "ocean" };
  const contact = sweepSurfaceContact(
    { x: -120, y: 5, z: 0 },
    { x: 120, y: 2, z: 0 },
    narrowShore,
    { sweepStep: 12, maximumProbeSpacing: 0.5, shorelineTransitionDistance: 4 },
  );
  assert.ok(contact, "high-speed sweep detects a sub-unit shoreline strip");
  assert.equal(contact.surface.surface, "terrain");
  assert.equal(contact.surface.id, "narrow-shore");
  assert.ok(Math.abs(contact.point.x) <= 0.35);
  assert.ok(contact.steps >= 480, "adaptive probing densifies the high-speed sweep");
}

{
  const narrowWater = (x) => x >= 10 && x <= 10.75
    ? { height: 0, surface: "water", validity: "valid", id: "narrow-water" }
    : { height: -20, surface: "terrain", validity: "valid", id: "submerged-floor" };
  const contact = sweepSurfaceContact(
    { x: -100, y: 1, z: 0 },
    { x: 140, y: 1, z: 0 },
    narrowWater,
    { sweepStep: 20, maximumProbeSpacing: 0.5, shorelineTransitionDistance: 2 },
  );
  assert.ok(contact, "high-speed sweep detects an explicit narrow water strip");
  assert.equal(contact.surface.surface, "water");
  assert.equal(contact.surface.id, "narrow-water");
  assert.ok(contact.point.x >= 10 && contact.point.x <= 10.75);
}

{
  const resolver = new FlightCollisionResolver({ maximumProbeSpacing: 0.5 });
  resolver.reset(
    { x: -4, y: 40, z: 0 },
    { height: 3, surface: "terrain", validity: "valid" },
  );
  const narrowWater = (x) => x >= 10 && x <= 10.75
    ? { height: 0, surface: "water", validity: "valid" }
    : { height: -20, surface: "terrain", validity: "valid" };
  const result = resolver.resolve({
    previous: { x: -100, y: 1, z: 0 },
    proposed: { x: 140, y: 1, z: 0 },
    velocity: { x: 240, y: 0, z: 0 },
    sampleSurface: narrowWater,
  });
  assert.equal(result.reason, "water-contact");
  assert.deepEqual(
    result.position,
    { x: -4, y: 40, z: 0 },
    "narrow-water recovery preserves the last safe terrain position",
  );
}

{
  const maximum = maximumFiniteHeightAlongSegment(
    { x: 0, y: 30, z: 0 },
    { x: 0, y: 30, z: -24 },
    (_x, z) => z <= -11.25 && z >= -12
      ? { height: 70, surface: "terrain", validity: "sparse" }
      : { height: 0, surface: "water", validity: "valid" },
    7,
    { maximumSpacing: 0.5, maximumSamples: 129 },
  );
  assert.equal(maximum, 70, "adaptive camera probing detects a narrow shoreline ridge");
}

{
  const rig = new ChaseCameraRig({
    distance: 24,
    height: 10,
    terrainClearance: 6,
    clearanceSamples: 7,
    clearanceProbeSpacing: 0.5,
  });
  const snapshot = rig.update({
    target: { x: 0, y: 30, z: 0 },
    yaw: 0,
    speed: 0,
    sampleHeight: (_x, z) => z <= -11.25 && z >= -12
      ? { height: 70, surface: "terrain", validity: "sparse" }
      : { height: 0, surface: "water", validity: "valid" },
  });
  assert.equal(snapshot.obstructed, true);
  assert.ok(snapshot.position.y >= 76, "camera clears the narrow ridge at speed-independent probe density");
}

assert.equal(
  resolveRecoveryAltitude(
    { x: 10.25, y: -20, z: 0 },
    () => ({ height: 0, surface: "water", validity: "valid" }),
    { minimumAltitude: 72, terrainClearance: 36 },
  ),
  72,
  "explicit narrow water still uses the safe recovery floor",
);

console.log("high-speed shoreline tunneling tests passed");
