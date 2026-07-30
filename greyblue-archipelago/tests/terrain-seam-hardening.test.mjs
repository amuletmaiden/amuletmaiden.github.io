import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { sampleTerrainGrid } = await importSource("../src/flight/isle-terrain-sampler.js");
const { sweepSurfaceContact } = await importSource("../src/flight/collision.js");
const { ChaseCameraRig, maximumFiniteHeightAlongSegment } = await importSource("../src/flight/chase-camera.js");

const seamField = {
  minX: 0,
  maxX: 12,
  minZ: 0,
  maxZ: 12,
  columns: 4,
  rows: 4,
  edgeClampCells: 0.5,
  sparseSearchRadius: 1,
  values: Float32Array.from([
    0, 0, 8, 8,
    0, Number.NaN, Number.NaN, 8,
    0, Number.NaN, Number.NaN, 8,
    0, 0, 8, 8,
  ]),
};

const sampleSurface = (x, z) => {
  const height = sampleTerrainGrid(seamField, x, z);
  return Number.isFinite(height)
    ? { height, surface: "terrain", id: "approved-isle" }
    : { height: 0, surface: "water", id: "ocean" };
};

{
  const contact = sweepSurfaceContact(
    { x: -1, y: 14, z: 6 },
    { x: 13, y: 5, z: 6 },
    sampleSurface,
    { sweepStep: 0.5, clearance: 2.5 },
  );
  assert.ok(contact, "swept collision remains continuous across clamped grid edges and sparse cells");
  assert.equal(contact.surface.id, "approved-isle");
  assert.ok(contact.point.x >= 5, "the sweep reaches the raised half of the Isle before contact");
  assert.ok(contact.point.x <= 13, "the contact remains bounded near the approved Isle edge");
}

{
  const maximum = maximumFiniteHeightAlongSegment(
    { x: 0, y: 30, z: 6 },
    { x: 12.5, y: 15, z: 6 },
    (x, z) => sampleTerrainGrid(seamField, x, z),
    9,
  );
  assert.equal(maximum, 8, "camera clearance samples the raised seam even when the endpoint is outside bounds");
}

{
  const rig = new ChaseCameraRig({ distance: 12, height: 2, terrainClearance: 5, clearanceSamples: 9 });
  const snapshot = rig.update({
    target: { x: 12.5, y: 8, z: 6 },
    yaw: Math.PI / 2,
    sampleHeight: (x, z) => sampleTerrainGrid(seamField, x, z),
  });
  assert.equal(snapshot.obstructed, true, "camera detects a boundary ridge anywhere along its chase segment");
  assert.ok(snapshot.position.y >= 13, "camera clears the sampled ridge plus configured clearance");
}

{
  const noData = maximumFiniteHeightAlongSegment(
    { x: 50, y: 20, z: 50 },
    { x: 60, y: 20, z: 60 },
    (x, z) => sampleTerrainGrid(seamField, x, z),
    7,
  );
  assert.equal(noData, Number.NEGATIVE_INFINITY, "missing terrain outside the seam does not invent a camera floor");
}

console.log("terrain seam hardening tests passed");