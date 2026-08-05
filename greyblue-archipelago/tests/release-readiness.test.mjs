import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseReadiness } from '../src/core/release-readiness.js';

const releasedDragon = {
  releaseId: 'dragon-D4-C2',
  status: 'released',
  gameSafe: true,
  coordinateContract: 'greyblue-v1',
  scaleContract: 'meters-v1',
  saveSchema: 2,
  files: ['dragon.glb'],
  optional: { animations: true, soundHooks: false },
};

const releasedIsle = {
  releaseId: 'isle-v016',
  status: 'released',
  gameSafe: true,
  coordinateContract: 'greyblue-v1',
  scaleContract: 'meters-v1',
  saveSchema: 2,
  files: ['isle.glb'],
  optional: { landmarks: true, mysteries: false },
};

test('selects exact immutable released manifests', () => {
  const result = buildReleaseReadiness({ dragonManifest: releasedDragon, isleManifest: releasedIsle });
  assert.equal(result.selected.dragonReleaseId, 'dragon-D4-C2');
  assert.equal(result.selected.isleReleaseId, 'isle-v016');
  assert.equal(result.publicBuildReady, true);
  assert.equal(result.fallbackReason, 'optional-content-omitted');
});

test('rejects unreleased active-source candidates', () => {
  const result = buildReleaseReadiness({
    dragonManifest: { ...releasedDragon, releaseId: 'dragon-D5', status: 'candidate' },
    isleManifest: { ...releasedIsle, releaseId: 'isle-v017', gameSafe: false },
  });
  assert.equal(result.publicBuildReady, false);
  assert.equal(result.minimalPlayable, true);
  assert.equal(result.selected.dragonReleaseId, null);
  assert.equal(result.selected.isleReleaseId, null);
  assert.deepEqual(result.requiredFailures, [
    'dragon:not-released-game-safe',
    'isle:not-released-game-safe',
  ]);
});

test('distinguishes missing required files from optional omissions', () => {
  const result = buildReleaseReadiness({
    dragonManifest: { ...releasedDragon, files: [], optional: { animations: false } },
    isleManifest: releasedIsle,
  });
  assert.equal(result.requiredFailureCount, 1);
  assert.equal(result.optionalOmissionCount, 2);
  assert.equal(result.fallbackReason, 'required-release-unavailable');
});

test('recovers malformed manifests deterministically', () => {
  const first = buildReleaseReadiness({ dragonManifest: null, isleManifest: [] });
  const second = buildReleaseReadiness({ dragonManifest: null, isleManifest: [] });
  assert.deepEqual(first, second);
  assert.equal(first.publicBuildReady, false);
  assert.doesNotThrow(() => JSON.stringify(first));
});

test('reports canonical exploration save incompatibility', () => {
  const result = buildReleaseReadiness({
    dragonManifest: { ...releasedDragon, saveSchema: 1 },
    isleManifest: releasedIsle,
    saveSchema: 2,
  });
  assert.equal(result.saveCompatibility, false);
  assert.equal(result.publicBuildReady, false);
});

test('does not mutate caller-owned manifests', () => {
  const dragon = structuredClone(releasedDragon);
  const isle = structuredClone(releasedIsle);
  const before = JSON.stringify({ dragon, isle });
  buildReleaseReadiness({ dragonManifest: dragon, isleManifest: isle });
  assert.equal(JSON.stringify({ dragon, isle }), before);
});
