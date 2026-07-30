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
assert.equal(sampleTerrainGrid(field, -1, 5), null);
assert.equal(sampleTerrainGrid(field, 5, 11), null);

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

console.log("isle terrain sampler tests passed");
