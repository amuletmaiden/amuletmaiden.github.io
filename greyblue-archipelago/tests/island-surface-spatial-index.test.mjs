import assert from 'node:assert/strict';
import test from 'node:test';
import { createIslandSurfaceSpatialIndex } from '../src/world/island-surface-spatial-index.js';

const islands = [
  { id: 'a', x: -700, z: -80, scale: 1 },
  { id: 'b', x: 10, z: 20, scale: 2 },
  { id: 'c', x: 580, z: 30, scale: 1.2 },
  { id: 'd', x: 5000, z: 5000, scale: 1 },
];

function generatedSurfaceChoice(candidates, x, z) {
  let result = { height: 0, surface: 'water', id: 'greyblue-ocean' };
  for (const island of candidates) {
    const distance = Math.hypot(x - island.x, z - island.z);
    const radius = 110 * island.scale;
    if (distance < radius) {
      const normalized = 1 - distance / radius;
      const height = island.height * normalized * normalized * 0.58;
      if (result.surface === 'water' || height > result.height) {
        result = { height, surface: 'terrain', id: island.id };
      }
    }
  }
  return result;
}

test('query conservatively contains every island whose current surface radius contains the point', () => {
  const index = createIslandSurfaceSpatialIndex(islands, { cellSize: 320 });
  for (const point of [
    { x: -700, z: -80 },
    { x: -590, z: -80 },
    { x: 10, z: 20 },
    { x: 229, z: 20 },
    { x: 580, z: 30 },
    { x: 448, z: 30 },
  ]) {
    const expected = islands.filter((island) =>
      Math.hypot(point.x - island.x, point.z - island.z) < 110 * island.scale);
    const actual = index.query(point.x, point.z);
    for (const island of expected) assert.equal(actual.includes(island), true, `${island.id} omitted at ${point.x},${point.z}`);
  }
});

test('candidate order follows immutable world order and distant cells prune unrelated islands', () => {
  const index = createIslandSurfaceSpatialIndex(islands, { cellSize: 320 });
  const nearOrigin = index.query(20, 20);
  assert.deepEqual(nearOrigin.map(({ id }) => id), ['b']);
  assert.deepEqual(index.query(9000, -9000), []);
});

test('overlapping envelopes preserve both candidates and negative cells work', () => {
  const overlap = [
    { id: 'first', x: -50, z: -50, scale: 2 },
    { id: 'second', x: 40, z: 30, scale: 2 },
  ];
  const index = createIslandSurfaceSpatialIndex(overlap, { cellSize: 128 });
  assert.deepEqual(index.query(0, 0).map(({ id }) => id), ['first', 'second']);
  assert.equal(index.query(-200, -200).some(({ id }) => id === 'first'), true);
});

test('indexed candidates preserve the exact full-scan generated surface winner', () => {
  const terrain = [
    { id: 'low-wide', x: -40, z: 10, scale: 2.2, height: 80 },
    { id: 'high-tight', x: 45, z: 5, scale: 1.15, height: 170 },
    { id: 'negative', x: -510, z: -430, scale: 1.4, height: 125 },
    { id: 'far', x: 4600, z: 4800, scale: 1, height: 300 },
  ];
  const index = createIslandSurfaceSpatialIndex(terrain, { cellSize: 192 });
  for (const point of [
    { x: 0, z: 0 },
    { x: 44, z: 5 },
    { x: -230, z: 10 },
    { x: -510, z: -430 },
    { x: -620, z: -430 },
    { x: 1200, z: -1200 },
    { x: 4600, z: 4800 },
  ]) {
    const fullScan = generatedSurfaceChoice(terrain, point.x, point.z);
    const indexed = generatedSurfaceChoice(index.query(point.x, point.z), point.x, point.z);
    assert.deepEqual(indexed, fullScan, `surface mismatch at ${point.x},${point.z}`);
  }
});

test('malformed queries are neutral and callers are not mutated', () => {
  const before = JSON.stringify(islands);
  const index = createIslandSurfaceSpatialIndex(islands);
  assert.deepEqual(index.query(Number.NaN, 0), []);
  assert.deepEqual(index.query(0, Number.POSITIVE_INFINITY), []);
  assert.equal(JSON.stringify(islands), before);
  assert.equal(index.telemetry().islandCount, islands.length);
});
