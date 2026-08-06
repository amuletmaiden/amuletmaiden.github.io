import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStreamingResidencyState,
  planStreamingResidency,
} from '../src/world/streaming-residency.js';

const island = (id, x, z = 0, radius = 0) => ({ id, position: { x, y: 0, z }, radius });

function finiteTree(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteTree);
  if (value && typeof value === 'object') return Object.values(value).every(finiteTree);
  return true;
}

test('projects fast flight forward so activation begins before arrival', () => {
  const result = planStreamingResidency({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 400, y: 0, z: 0 },
    islands: [island('ahead', 1500), island('behind', -1500)],
  });
  assert.deepEqual(result.state.activeIds, ['ahead']);
  assert.deepEqual(result.telemetry.activatedIds, ['ahead']);
});

test('retains an active island through short reversal and threshold jitter', () => {
  const previous = createStreamingResidencyState({ activeIds: ['home'] });
  const result = planStreamingResidency({
    position: { x: 1050, y: 0, z: 0 },
    velocity: { x: 25, y: 0, z: 0 },
    islands: [island('home', 0)],
  }, previous, { activationDistance: 900, warmDistance: 1200, retirementDistance: 1700 });
  assert.deepEqual(result.state.activeIds, ['home']);
  assert.deepEqual(result.telemetry.retiredIds, []);
});

test('keeps a landing-orbit island resident while projected position swings away', () => {
  const previous = createStreamingResidencyState({ activeIds: ['landing'] });
  const result = planStreamingResidency({
    position: { x: 0, y: 80, z: 950 },
    velocity: { x: -300, y: 0, z: 0 },
    islands: [island('landing', 0, 0, 150)],
  }, previous);
  assert.equal(result.state.activeIds.includes('landing'), true);
});

test('enforces deterministic active and warm budgets', () => {
  const result = planStreamingResidency({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    islands: [island('c', 300), island('a', 300), island('b', 300), island('warm', 1100)],
  }, {}, { maxActive: 2, maxWarm: 1, activationDistance: 500, warmDistance: 1300 });
  assert.deepEqual(result.state.activeIds, ['a', 'b']);
  assert.deepEqual(result.state.warmIds, ['c']);
  assert.equal(result.telemetry.activeBudgetPressure, 1);
  assert.equal(result.telemetry.warmBudgetPressure, 1);
});

test('orders by projected relevance, then current distance, then stable id', () => {
  const result = planStreamingResidency({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 100, y: 0, z: 0 },
    islands: [island('far-now-near-next', 350), island('near-now', -100), island('same-b', 500), island('same-a', 500)],
  }, {}, { projectionSeconds: 3, activationDistance: 1000, maxActive: 4 });
  assert.deepEqual(result.state.activeIds, ['far-now-near-next', 'same-a', 'same-b', 'near-now']);
});

test('falls back safely for malformed velocity and malformed islands', () => {
  const result = planStreamingResidency({
    position: { x: Number.NaN, y: 0, z: 0 },
    velocity: { x: Number.NaN, y: 0, z: 0 },
    islands: [null, { id: '', position: {} }, island('valid', 10)],
  });
  assert.equal(result.projection.fallbackUsed, true);
  assert.deepEqual(result.state.activeIds, ['valid']);
  assert.equal(finiteTree(result), true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('retires residents beyond the retirement threshold', () => {
  const previous = createStreamingResidencyState({ activeIds: ['old'], warmIds: ['older'] });
  const result = planStreamingResidency({
    position: { x: 5000, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    islands: [island('old', 0), island('older', 0)],
  }, previous);
  assert.deepEqual(result.state.activeIds, []);
  assert.deepEqual(result.state.warmIds, []);
  assert.deepEqual(result.telemetry.retiredIds, ['old', 'older']);
});

test('handles an empty world deterministically', () => {
  const result = planStreamingResidency({ position: {}, velocity: {}, islands: [] });
  assert.deepEqual(result.state, { activeIds: [], warmIds: [] });
  assert.equal(result.telemetry.islandCount, 0);
});

test('does not mutate caller-owned inputs or prior state', () => {
  const input = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 1, y: 0, z: 0 },
    islands: [island('one', 100)],
  };
  const previous = { activeIds: ['legacy'], warmIds: [] };
  const snapshot = JSON.stringify({ input, previous });
  planStreamingResidency(input, previous);
  assert.equal(JSON.stringify({ input, previous }), snapshot);
});
