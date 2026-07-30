import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/flight/collision.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { FlightCollisionResolver, sweepSurfaceContact } = await import(moduleUrl);

const terrain = (_x, _z) => ({ height: 0, surface: "terrain", id: "test-ground" });
const water = (_x, _z) => ({ height: 0, surface: "water", id: "test-sea" });

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 30, z: 0 },
    proposed: { x: 0, y: 25, z: 10 },
    velocity: { x: 0, y: -2, z: 20 },
    sampleSurface: terrain,
  });
  assert.equal(result.collided, false);
  assert.equal(result.reason, "clear");
  assert.deepEqual(result.position, { x: 0, y: 25, z: 10 });
}

{
  const contact = sweepSurfaceContact(
    { x: 0, y: 40, z: 0 },
    { x: 0, y: -20, z: 0 },
    terrain,
    { sweepStep: 2, clearance: 2.5 },
  );
  assert.ok(contact, "sweep catches a high-speed ground crossing");
  assert.ok(contact.point.y <= 2.5);
  assert.ok(contact.step > 1, "collision was found along the swept path");
}

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 10, z: 0 },
    proposed: { x: 0, y: 1, z: 8 },
    velocity: { x: 0, y: -5, z: 10 },
    sampleSurface: terrain,
    landingRequested: true,
  });
  assert.equal(result.reason, "touchdown");
  assert.equal(result.grounded, true);
  assert.equal(result.requiresRecovery, false);
  assert.equal(result.position.y, 2.5);
  assert.equal(result.velocity.y, 0);
}

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 18, z: 0 },
    proposed: { x: 0, y: -10, z: 40 },
    velocity: { x: 0, y: -30, z: 80 },
    sampleSurface: terrain,
    landingRequested: true,
  });
  assert.equal(result.reason, "terrain-impact", "unsafe touchdown becomes a deflection");
  assert.equal(result.grounded, false);
  assert.ok(result.position.y > 2.5);
  assert.ok(result.velocity.y >= 4);
  assert.ok(result.velocity.z < 80);
}

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 8, z: 0 },
    proposed: { x: 0, y: -4, z: 12 },
    velocity: { x: 0, y: -12, z: 20 },
    sampleSurface: water,
  });
  assert.equal(result.reason, "water-contact");
  assert.equal(result.requiresRecovery, true);
  assert.equal(result.grounded, false, "the dragon cannot land on open water");
}

{
  const resolver = new FlightCollisionResolver();
  const result = resolver.resolve({
    previous: { x: 0, y: 20, z: 0 },
    proposed: { x: Number.NaN, y: 10, z: 0 },
    velocity: { x: 0, y: -2, z: 10 },
    sampleSurface: terrain,
  });
  assert.equal(result.reason, "non-finite-flight-state");
  assert.equal(result.requiresRecovery, true);
  assert.deepEqual(result.position, { x: 0, y: 160, z: 220 });
}

{
  const resolver = new FlightCollisionResolver({ snagThreshold: 3, snagLift: 6 });
  let result = null;
  for (let index = 0; index < 3; index += 1) {
    result = resolver.resolve({
      previous: { x: 0, y: 4, z: 0 },
      proposed: { x: 0, y: 1, z: 2 },
      velocity: { x: 0, y: -3, z: 5 },
      sampleSurface: terrain,
    });
  }
  assert.equal(result.reason, "snag-escape");
  assert.ok(result.position.y >= 12, "repeated contact adds a decisive escape lift");
  assert.ok(result.velocity.y >= 7);
}

{
  const ridge = (x, _z) => ({
    height: x >= 5 ? 15 : 0,
    surface: "terrain",
    id: "ridge",
  });
  const contact = sweepSurfaceContact(
    { x: 0, y: 20, z: 0 },
    { x: 12, y: 10, z: 0 },
    ridge,
    { sweepStep: 1, clearance: 2.5 },
  );
  assert.ok(contact, "horizontal sweeps detect terrain rising into the flight path");
  assert.equal(contact.surface.id, "ridge");
  assert.ok(contact.point.x >= 5);
}

{
  const resolver = new FlightCollisionResolver();
  resolver.resolve({
    previous: { x: 4, y: 30, z: 8 },
    proposed: { x: 6, y: 28, z: 12 },
    velocity: { x: 2, y: -2, z: 4 },
    sampleSurface: terrain,
  });
  const result = resolver.resolve({
    previous: { x: 6, y: 28, z: 12 },
    proposed: { x: Infinity, y: 10, z: 12 },
    velocity: { x: 2, y: -2, z: 4 },
    sampleSurface: terrain,
  });
  assert.deepEqual(
    result.position,
    { x: 6, y: 28, z: 12 },
    "non-finite recovery returns to the last safely observed point",
  );
}

console.log("collision tests passed");
