import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBootReleaseGate } from '../src/core/boot-release-gate.js';

const releasedReadiness = Object.freeze({
  publicBuildReady: true,
  selected: Object.freeze({ dragonReleaseId: 'dragon-r4', isleReleaseId: 'isle-v16' }),
  requiredFailureCount: 0,
  optionalOmissionCount: 0,
});

const blockedReadiness = Object.freeze({
  publicBuildReady: false,
  selected: Object.freeze({ dragonReleaseId: null, isleReleaseId: null }),
  requiredFailureCount: 2,
  optionalOmissionCount: 0,
});

test('loads both released immutable assets and reports released mode', async () => {
  const calls = [];
  const result = await executeBootReleaseGate({
    readiness: releasedReadiness,
    assets: { dragon: '/dragon-r4.glb', isle: '/isle-v16.glb' },
    loadDragon: async (source) => { calls.push(['dragon', source]); return { id: 'dragon' }; },
    loadIsle: async (source) => { calls.push(['isle', source]); return { id: 'isle' }; },
  });

  assert.equal(result.mode, 'released');
  assert.equal(result.playable, true);
  assert.deepEqual(calls.sort(), [['dragon', '/dragon-r4.glb'], ['isle', '/isle-v16.glb']]);
  assert.equal(result.telemetry.loadFailureCount, 0);
});

test('does not call released asset loaders when readiness gate is closed', async () => {
  let calls = 0;
  const result = await executeBootReleaseGate({
    readiness: blockedReadiness,
    assets: { dragon: '/unreleased-dragon.glb', isle: '/unreleased-isle.glb' },
    loadDragon: async () => { calls += 1; return {}; },
    loadIsle: async () => { calls += 1; return {}; },
    fallbackFactories: {
      dragon: () => ({ fallback: 'dragon' }),
      isle: () => ({ fallback: 'isle' }),
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.mode, 'minimal-playable');
  assert.equal(result.playable, true);
  assert.deepEqual(result.telemetry.fallbackUsed, ['dragon', 'isle']);
  assert.deepEqual(result.telemetry.loadFailures, [
    'dragon:release-gate-closed',
    'isle:release-gate-closed',
  ]);
});

test('uses a bounded fallback for one failed released asset', async () => {
  const result = await executeBootReleaseGate({
    readiness: releasedReadiness,
    assets: { dragon: '/dragon-r4.glb', isle: '/isle-v16.glb' },
    loadDragon: async () => ({ id: 'dragon' }),
    loadIsle: async () => { throw new Error('network'); },
    fallbackFactories: { isle: () => ({ fallback: 'isle' }) },
  });

  assert.equal(result.mode, 'minimal-playable');
  assert.equal(result.playable, true);
  assert.deepEqual(result.telemetry.loadFailures, ['isle:network']);
  assert.deepEqual(result.telemetry.fallbackUsed, ['isle']);
});

test('reports blocked when neither release nor fallback can produce a whole slice', async () => {
  const result = await executeBootReleaseGate({ readiness: blockedReadiness });

  assert.equal(result.mode, 'blocked');
  assert.equal(result.playable, false);
  assert.equal(result.dragon, null);
  assert.equal(result.isle, null);
});

test('normalizes missing loaders and empty load results deterministically', async () => {
  const result = await executeBootReleaseGate({
    readiness: releasedReadiness,
    assets: { dragon: '/dragon-r4.glb', isle: '/isle-v16.glb' },
    loadIsle: async () => null,
  });

  assert.deepEqual(result.telemetry.loadFailures, [
    'dragon:loader-unavailable',
    'isle:empty-load-result',
  ]);
});

test('does not mutate readiness or asset inputs', async () => {
  const readiness = structuredClone(releasedReadiness);
  const assets = { dragon: '/dragon-r4.glb', isle: '/isle-v16.glb' };
  const beforeReadiness = structuredClone(readiness);
  const beforeAssets = structuredClone(assets);

  await executeBootReleaseGate({
    readiness,
    assets,
    loadDragon: async () => ({}),
    loadIsle: async () => ({}),
  });

  assert.deepEqual(readiness, beforeReadiness);
  assert.deepEqual(assets, beforeAssets);
});
