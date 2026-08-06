import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepContact } from '../src/flight/swept-contact.js';

const flatTerrain = ({ x }) => ({
  height: x >= 5 && x <= 6 ? 8 : 0,
  normal: { x: 0, y: 1, z: 0 },
});

test('detects narrow terrain crossed by a high-speed frame', () => {
  const result = sweepContact({
    start: { x: 0, y: 6, z: 0 },
    end: { x: 12, y: 6, z: 0 },
    sampleTerrain: flatTerrain,
  }, { maxStepDistance: 0.5 });

  assert.equal(result.hit, true);
  assert.equal(result.kind, 'terrain');
  assert.ok(result.fraction > 0 && result.fraction < 1);
  assert.ok(result.telemetry.hitSample > 0);
});

test('detects explicit water before lower terrain', () => {
  const result = sweepContact({
    start: { x: 0, y: 3, z: 0 },
    end: { x: 0, y: -2, z: 0 },
    waterHeight: 1,
    sampleTerrain: () => ({ height: -10, normal: { x: 0, y: 1, z: 0 } }),
  });

  assert.equal(result.hit, true);
  assert.equal(result.kind, 'water');
  assert.ok(Math.abs(result.point.y - 1.05) < 0.3);
  assert.deepEqual(result.normal, { x: 0, y: 1, z: 0 });
});

test('returns no contact for a clear path', () => {
  const result = sweepContact({
    start: { x: 0, y: 20, z: 0 },
    end: { x: 10, y: 20, z: 0 },
    sampleTerrain: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
  });

  assert.equal(result.hit, false);
  assert.equal(result.kind, 'none');
  assert.equal(result.fraction, 1);
});

test('uses deterministic bounded sampling under extreme motion', () => {
  const result = sweepContact({
    start: { x: 0, y: 100, z: 0 },
    end: { x: 100000, y: 100, z: 0 },
    sampleTerrain: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
  }, { maxStepDistance: 0.1, maxSamples: 12 });

  assert.equal(result.telemetry.sampleCount, 12);
  assert.equal(result.telemetry.sampleCapReached, true);
});

test('recovers from malformed and throwing terrain samplers', () => {
  const malformed = sweepContact({
    start: { x: Number.NaN, y: 4, z: 0 },
    end: { x: 2, y: 4, z: 0 },
    fallbackTerrainHeight: 0,
    sampleTerrain: () => { throw new Error('bad sample'); },
  });

  assert.equal(malformed.hit, false);
  assert.ok(malformed.telemetry.fallbackCount > 0);
  assert.ok(Number.isFinite(malformed.point.x));
  assert.doesNotThrow(() => JSON.stringify(malformed));
});

test('does not mutate caller vectors or terrain samples', () => {
  const start = Object.freeze({ x: 0, y: 2, z: 0 });
  const end = Object.freeze({ x: 0, y: -1, z: 0 });
  const sample = Object.freeze({ height: 0, normal: Object.freeze({ x: 0, y: 1, z: 0 }) });

  sweepContact({ start, end, sampleTerrain: () => sample });

  assert.deepEqual(start, { x: 0, y: 2, z: 0 });
  assert.deepEqual(end, { x: 0, y: -1, z: 0 });
  assert.deepEqual(sample, { height: 0, normal: { x: 0, y: 1, z: 0 } });
});

test('stabilizes unusable terrain normals', () => {
  const result = sweepContact({
    start: { x: 0, y: 2, z: 0 },
    end: { x: 0, y: -1, z: 0 },
    sampleTerrain: () => ({ height: 0, normal: { x: 1, y: -1, z: 0 } }),
  });

  assert.equal(result.hit, true);
  assert.ok(result.normal.y >= 0.049);
  assert.ok(Math.abs(Math.hypot(result.normal.x, result.normal.y, result.normal.z) - 1) < 1e-9);
});
