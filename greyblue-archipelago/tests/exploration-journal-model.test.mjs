import assert from 'node:assert/strict';
import { createExplorationJournalState, stepExplorationJournal } from '../src/core/exploration-journal-model.js';

const empty = createExplorationJournalState();
assert.equal(empty.lastDiscoveryKey, null);
assert.deepEqual(empty.discoveries, []);
assert.equal(Object.isFrozen(empty), true);
assert.equal(Object.isFrozen(empty.discoveries), true);

const route = stepExplorationJournal(empty, {
  routeGuidance: { destinationName: 'Bellglass Reach' },
  discoveredCount: 2,
  discoveredRouteCount: 1,
});
assert.equal(route.view.objective, 'Cross toward Bellglass Reach.');
assert.equal(route.view.context, '2 isles · 1 routes found');

const survey = stepExplorationJournal(empty, {
  nearestIsland: { id: 'isle-3', name: 'Blue Teeth', distance: 432.6 },
  discovered: ['isle-1'],
  discoveredCount: 1,
  discoveredRouteCount: 0,
});
assert.equal(survey.view.objective, 'Survey Blue Teeth.');
assert.match(survey.view.context, /Blue Teeth · 433m/);

const search = stepExplorationJournal(empty, {
  currentRegion: { name: 'Mothwater' },
  nearestIsland: { id: 'isle-1', name: 'Known Isle', distance: 80 },
  discovered: ['isle-1'],
});
assert.equal(search.view.objective, 'Search Mothwater for another route or landmark.');

const found = stepExplorationJournal(empty, {
  latestDiscovery: {
    islandId: 'isle-4',
    discoveredAt: 42,
    landmark: { id: 'needle', name: 'The Needle' },
  },
});
assert.equal(found.view.announcement, 'Landmark found: The Needle');
assert.deepEqual(found.view.discoveries, ['Landmark found: The Needle']);

const duplicate = stepExplorationJournal(found.state, {
  latestDiscovery: {
    islandId: 'isle-4',
    discoveredAt: 42,
    landmark: { id: 'needle', name: 'The Needle' },
  },
});
assert.equal(duplicate.view.announcement, null);
assert.deepEqual(duplicate.view.discoveries, ['Landmark found: The Needle']);

let rolling = found.state;
for (let index = 0; index < 7; index += 1) {
  rolling = stepExplorationJournal(rolling, {
    latestDiscovery: { routeId: `route-${index}`, discoveredAt: 100 + index },
  }).state;
}
assert.equal(rolling.discoveries.length, 5);
assert.equal(rolling.discoveries[0], 'Route discovered: route-6');
assert.equal(rolling.discoveries[4], 'Route discovered: route-2');

const malformed = stepExplorationJournal(null, {
  nearestIsland: { id: 'isle-x', name: 'Mist', distance: Number.NaN },
  discoveredCount: Number.NaN,
  discoveredRouteCount: Number.POSITIVE_INFINITY,
});
assert.equal(malformed.view.objective, 'Survey Mist.');
assert.equal(malformed.view.context, '0 isles · 0 routes found');
assert.equal(Object.isFrozen(malformed), true);
assert.equal(Object.isFrozen(malformed.state), true);
assert.equal(Object.isFrozen(malformed.view), true);

const caller = { latestDiscovery: { islandId: 'isle-safe', discoveredAt: 9 } };
const before = JSON.stringify(caller);
stepExplorationJournal(empty, caller);
assert.equal(JSON.stringify(caller), before);

console.log('exploration journal model tests passed');
