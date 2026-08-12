import assert from 'node:assert/strict';
import { shouldRevealLandmarkEncounter } from '../src/core/landmark-encounter-presentation.js';

const view = Object.freeze({
  visible: true,
  available: true,
  visited: false,
  landmarkId: 'landmark-7',
});

assert.equal(shouldRevealLandmarkEncounter({
  event: { landmarkId: 'landmark-7', regionId: 'region-2' },
  encounterView: view,
  currentRegionId: 'region-2',
}), true, 'matching canonical investigation reveals the current eligible landmark');

assert.equal(shouldRevealLandmarkEncounter({
  event: { landmarkId: 'landmark-8', regionId: 'region-2' },
  encounterView: view,
  currentRegionId: 'region-2',
}), false, 'wrong landmark fails closed');

assert.equal(shouldRevealLandmarkEncounter({
  event: { landmarkId: 'landmark-7', regionId: 'region-3' },
  encounterView: view,
  currentRegionId: 'region-2',
}), false, 'wrong region fails closed');

assert.equal(shouldRevealLandmarkEncounter({
  event: { landmarkId: 'landmark-7', regionId: 'region-2', extra: 'ignored' },
  encounterView: { ...view, available: false },
  currentRegionId: 'region-2',
}), false, 'approach-ineligible presentation cannot reveal');

assert.equal(shouldRevealLandmarkEncounter({
  event: { landmarkId: 'landmark-7', regionId: 'region-2' },
  encounterView: { ...view, visited: true },
  currentRegionId: 'region-2',
}), false, 'visited presentation cannot reveal again');

for (const event of [null, {}, { landmarkId: 'landmark-7' }, { regionId: 'region-2' }]) {
  assert.equal(shouldRevealLandmarkEncounter({ event, encounterView: view, currentRegionId: 'region-2' }), false);
}

const frozenEvent = Object.freeze({ landmarkId: 'landmark-7', regionId: 'region-2' });
shouldRevealLandmarkEncounter({ event: frozenEvent, encounterView: view, currentRegionId: 'region-2' });
assert.deepEqual(frozenEvent, { landmarkId: 'landmark-7', regionId: 'region-2' }, 'caller event remains unmodified');

console.log('landmark encounter presentation tests passed');
