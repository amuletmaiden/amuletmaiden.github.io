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
  maximumFiniteHeightAlongSegment,
  resolveRecoveryAltitude,
} = await importSource("../src/flight/chase-camera.js");

const shoreline = (x) => x < 0
  ? { height: 0, surface: "water", validity: "valid", id: "ocean" }
  : { height: 3, surface: "terrain", validity: "sparse", id: "shore" };

{
  const contact = sweepSurfaceContact(
    { x: -8, y: 5, z: 0 },
    { x: 8, y: 2, z: 0 },
    shoreline,
    { sweepStep: 1, clearance: 2.5, shorelineTransitionDistance: 10 },
  );
  assert.ok(contact, "shoreline sweep produces a contact");
  assert.equal(contact.surface.surface, "terrain", "nearby land wins over the first water sample");
  assert.equal(contact.surface.id, "shore");
  assert.ok(contact.point.x >= 0, "contact resolves on the land side of the boundary");
}

{
  const contact = sweepSurfaceContact(
    { x: -30, y: 4, z: 0 },
    { x: -10, y: -4, z: 0 },
    shoreline,
    { sweepStep: 1, shorelineTransitionDistance: 6 },
  );
  assert.equal(contact.surface.surface, "water", "open-water impact remains water recovery");
}

{
  const resolver = new FlightCollisionResolver({ shorelineTransitionDistance: 10 });
  resolver.reset({ x: 4, y: 40, z: 0 }, { height: 3, surface: "terrain", validity: "valid" });

  const overWater = resolver.resolve({
    previous: { x: 4, y: 40, z: 0 },
    proposed: { x: -20, y: 50, z: 0 },
    velocity: { x: -24, y: 10, z: 0 },
    sampleSurface: shoreline,
  });
  assert.equal(overWater.collided, false);

  const waterImpact = resolver.resolve({
    previous: overWater.position,
    proposed: { x: -20, y: -5, z: 0 },
    velocity: { x: 0, y: -30, z: 0 },
    sampleSurface: shoreline,
  });
  assert.equal(waterImpact.reason, "water-contact");
  assert.deepEqual(
    waterImpact.position,
    { x: 4, y: 40, z: 0 },
    "water recovery preserves the last safe land position rather than a later over-water point",
  );
}

assert.equal(
  resolveRecoveryAltitude(
    { x: -4, y: -20, z: 0 },
    () => ({ height: 0, surface: "water", validity: "valid" }),
    { minimumAltitude: 72, terrainClearance: 36 },
  ),
  72,
  "explicit water uses the conservative recovery floor",
);
assert.equal(
  resolveRecoveryAltitude(
    { x: 4, y: 20, z: 0 },
    () => ({ height: 3, surface: "terrain", validity: "sparse" }),
    { minimumAltitude: 20, terrainClearance: 36 },
  ),
  39,
  "sparse shoreline terrain still contributes recovery clearance",
);

assert.equal(
  maximumFiniteHeightAlongSegment(
    { x: -12, y: 30, z: 0 },
    { x: 12, y: 30, z: 0 },
    (x) => x < 0
      ? { height: 400, surface: "water", validity: "valid" }
      : { height: 18, surface: "terrain", validity: "sparse" },
    13,
  ),
  18,
  "camera clearance ignores water spikes and resumes on sparse shoreline terrain",
);

console.log("shoreline transition tests passed");
