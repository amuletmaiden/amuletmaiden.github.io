import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/flight/isle-terrain-sampler.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { sampleTerrainGrid } = await import(moduleUrl);

const field = {
  minX: 0,
  maxX: 10,
  minZ: 0,
  maxZ: 10,
  columns: 2,
  rows: 2,
  values: Float32Array.from([0, 10, 20, 30]),
};

assert.equal(sampleTerrainGrid(field, 0, 0), 0);
assert.equal(sampleTerrainGrid(field, 10, 10), 30);
assert.equal(sampleTerrainGrid(field, 5, 5), 15);
assert.equal(sampleTerrainGrid(field, -6, 5), null, "queries well outside the grid stay outside");
assert.equal(sampleTerrainGrid(field, 5, 16), null, "far overshoot does not clamp onto terrain");
assert.equal(sampleTerrainGrid(field, -2, 0), 0, "sub-cell x overshoot clamps to the boundary sample");
assert.equal(sampleTerrainGrid(field, 12, 10), 30, "sub-cell x overshoot clamps to the far edge");
assert.equal(sampleTerrainGrid(field, 0, -2), 0, "sub-cell z overshoot clamps to the boundary sample");
assert.equal(sampleTerrainGrid(field, 10, 12), 30, "sub-cell z overshoot clamps to the far edge");
assert.equal(
  sampleTerrainGrid(field, -2, 0, { edgeClampCells: 0 }),
  null,
  "edge clamping can be disabled for strict bounds",
);

const partial = {
  ...field,
  minX: 0,
  maxX: 1,
  minZ: 0,
  maxZ: 1,
  values: Float32Array.from([10, Number.NaN, Number.NaN, 30]),
};
assert.equal(sampleTerrainGrid(partial, 0, 0), 10);
assert.equal(sampleTerrainGrid(partial, 1, 1), 30);
assert.equal(sampleTerrainGrid(partial, 0.5, 0.5), 20);

const sparse = {
  minX: 0,
  maxX: 2,
  minZ: 0,
  maxZ: 2,
  columns: 3,
  rows: 3,
  values: Float32Array.from([
    4, Number.NaN, 8,
    Number.NaN, Number.NaN, Number.NaN,
    12, Number.NaN, 16,
  ]),
};
assert.equal(
  sampleTerrainGrid(sparse, 1, 1),
  4,
  "a fully missing interpolation cell falls back to the nearest finite grid sample",
);
assert.equal(
  sampleTerrainGrid(sparse, 1, 1, { sparseSearchRadius: 0 }),
  null,
  "sparse fallback remains bounded and can be disabled",
);
assert.equal(sampleTerrainGrid({ ...field, values: Float32Array.from([0]) }, 0, 0), null);

console.log("isle terrain sampler tests passed");