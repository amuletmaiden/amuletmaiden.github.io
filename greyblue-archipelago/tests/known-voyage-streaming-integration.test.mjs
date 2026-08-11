import assert from 'node:assert/strict';
import test from 'node:test';
import { createStreamedIslandPool } from '../src/core/streamed-island-pool.js';
import {
  clearKnownVoyageStreamingCandidates,
  setKnownVoyageStreamingCandidates,
} from '../src/core/known-voyage-streaming-channel.js';

function island(id, x = 0) {
  return { id, x, z: 0, scale: 1, height: 100, landmark: false };
}

function poolHarness() {
  let sequence = 0;
  return createStreamedIslandPool({
    cap: 4,
    create() { return { resourceId: ++sequence, state: null }; },
    reset(resource, value) { resource.state = value ? { ...value } : null; },
    dispose() {},
  });
}

test('continuity candidates augment rather than replace baseline residency', () => {
  clearKnownVoyageStreamingCandidates();
  const pool = poolHarness();
  setKnownVoyageStreamingCandidates([island('known-prewarm', 2600)]);
  const resources = pool.sync([island('baseline', 100)]);
  assert.deepEqual(resources.map((resource) => resource.state.id), ['baseline', 'known-prewarm']);
  clearKnownVoyageStreamingCandidates();
});

test('duplicate continuity candidate cannot duplicate an already-resident island', () => {
  clearKnownVoyageStreamingCandidates();
  const pool = poolHarness();
  setKnownVoyageStreamingCandidates([island('same', 200)]);
  const resources = pool.sync([island('same', 200)]);
  assert.equal(resources.length, 1);
  assert.equal(pool.telemetry().active, 1);
  clearKnownVoyageStreamingCandidates();
});

test('clearing continuity lets the existing streamer release only the augmentation', () => {
  clearKnownVoyageStreamingCandidates();
  const pool = poolHarness();
  setKnownVoyageStreamingCandidates([island('known-prewarm', 2600)]);
  pool.sync([island('baseline', 100)]);
  clearKnownVoyageStreamingCandidates();
  const resources = pool.sync([island('baseline', 100)]);
  assert.deepEqual(resources.map((resource) => resource.state.id), ['baseline']);
  assert.equal(pool.telemetry().active, 1);
});

test('private channel sanitizes and bounds candidates', () => {
  clearKnownVoyageStreamingCandidates();
  setKnownVoyageStreamingCandidates([
    { id: 'bad', x: NaN, z: 0, scale: 1, height: 1 },
    ...Array.from({ length: 12 }, (_, index) => island(`known-${index}`, index)),
  ]);
  const pool = poolHarness();
  const resources = pool.sync([]);
  assert.equal(resources.length, 8);
  assert.equal(resources.some((resource) => resource.state.id === 'bad'), false);
  clearKnownVoyageStreamingCandidates();
});
