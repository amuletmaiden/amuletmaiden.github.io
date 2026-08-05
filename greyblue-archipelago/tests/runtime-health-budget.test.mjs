import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeHealthState, updateRuntimeHealth } from '../src/core/runtime-health-budget.js';

function stepMany(state, count, sample, config) {
  let next = state;
  for (let index = 0; index < count; index += 1) next = updateRuntimeHealth(next, sample, config);
  return next;
}

test('healthy play remains at full quality', () => {
  const state = updateRuntimeHealth(createRuntimeHealthState(), {
    frameMs: 14,
    activeIslands: 8,
    pendingLoads: 1,
  });
  assert.equal(state.mode, 'normal');
  assert.deepEqual(state.quality, {
    islandRadiusScale: 1,
    ambientDensityScale: 1,
    shadowScale: 1,
  });
});

test('sustained slow frames degrade without immediately entering critical mode', () => {
  const state = stepMany(createRuntimeHealthState(), 20, { frameMs: 29 }, { criticalSamples: 12 });
  assert.equal(state.mode, 'degraded');
  assert.equal(state.quality.islandRadiusScale, 0.78);
  assert.equal(state.telemetry.changed, false);
});

test('sustained critical pressure enters the bounded critical profile', () => {
  const state = stepMany(createRuntimeHealthState(), 12, {
    frameMs: 48,
    activeIslands: 25,
    pendingLoads: 6,
  });
  assert.equal(state.mode, 'critical');
  assert.equal(state.quality.ambientDensityScale, 0.35);
  assert.equal(state.telemetry.overloaded, true);
  assert.equal(state.transitionCount, 2);
});

test('recovery requires a stable healthy window rather than oscillating', () => {
  const critical = stepMany(createRuntimeHealthState(), 3, { frameMs: 60 }, { criticalSamples: 3 });
  const almostRecovered = stepMany(critical, 4, { frameMs: 12 }, { recoverySamples: 5 });
  const recovered = updateRuntimeHealth(almostRecovered, { frameMs: 12 }, { recoverySamples: 5 });
  assert.equal(almostRecovered.mode, 'critical');
  assert.equal(recovered.mode, 'normal');
});

test('world streaming pressure degrades even when frame time is currently healthy', () => {
  const state = updateRuntimeHealth(createRuntimeHealthState(), {
    frameMs: 12,
    activeIslands: 19,
    pendingLoads: 0,
  });
  assert.equal(state.mode, 'degraded');
  assert.equal(state.telemetry.overloaded, true);
});

test('malformed samples remain finite, bounded, immutable, and JSON-safe', () => {
  const input = Object.freeze({ frameMs: Number.NaN, activeIslands: -40, pendingLoads: Infinity });
  const state = updateRuntimeHealth(null, input, { maxRecentSamples: 12 });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.recentFrameMs), true);
  assert.ok(Number.isFinite(state.telemetry.averageFrameMs));
  assert.ok(state.recentFrameMs.length <= 12);
  assert.doesNotThrow(() => JSON.stringify(state));
  assert.deepEqual(input, { frameMs: Number.NaN, activeIslands: -40, pendingLoads: Infinity });
});
