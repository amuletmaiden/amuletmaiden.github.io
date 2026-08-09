import assert from 'node:assert/strict';
import {
  deriveRegionalMysteryThread,
  regionalMysteryThreadPublicState,
} from '../src/core/regional-mystery-thread.js';

const world = {
  islands: [
    { id: 'isle-a', regionId: 'region-a', landmarkRecord: { id: 'landmark-a', encounter: { class: 'resonance' } } },
    { id: 'isle-b', regionId: 'region-a', landmarkRecord: { id: 'landmark-b', encounter: { class: 'instrument' } } },
    { id: 'isle-c', regionId: 'region-a', landmarkRecord: { id: 'landmark-c', encounter: { class: 'relic' } } },
    { id: 'isle-d', regionId: 'region-b', landmarkRecord: { id: 'landmark-d', encounter: { class: 'threshold' } } },
    { id: 'isle-secret', regionId: 'region-a', landmarkRecord: { id: 'secret-landmark', encounter: { class: 'relic' } } },
  ],
};

const base = {
  world,
  currentRegionId: 'region-a',
  discoveredIslandIds: ['isle-a', 'isle-b', 'isle-c'],
  investigatedLandmarkIds: ['landmark-a', 'landmark-b'],
  exploration: { events: [] },
  listenRequested: true,
};

const active = deriveRegionalMysteryThread(base);
assert.equal(active.active, true);
assert.equal(active.recognized, false);
assert.ok(['chorus', 'instrument', 'relic', 'threshold'].includes(active.threadClass));

const stable = deriveRegionalMysteryThread({
  ...base,
  discoveredIslandIds: [...base.discoveredIslandIds].reverse(),
  investigatedLandmarkIds: [...base.investigatedLandmarkIds].reverse(),
});
assert.equal(stable.threadClass, active.threadClass, 'thread class must not depend on caller ordering');

assert.equal(deriveRegionalMysteryThread({ ...base, listenRequested: false }).active, false, 'passive state must not recognize a thread');
assert.equal(deriveRegionalMysteryThread({ ...base, recoveryActive: true }).active, false, 'recovery must suppress recognition');
assert.equal(deriveRegionalMysteryThread({ ...base, investigatedLandmarkIds: ['landmark-a'] }).active, false, 'one known investigated landmark is insufficient');
assert.equal(deriveRegionalMysteryThread({ ...base, currentRegionId: 'region-b' }).active, false, 'unrelated current region must fail closed');
assert.equal(deriveRegionalMysteryThread({
  ...base,
  discoveredIslandIds: ['isle-a', 'isle-b', 'isle-secret'],
  investigatedLandmarkIds: ['landmark-a', 'secret-landmark'],
}).active, false, 'undiscovered hidden landmark must not contribute evidence');

const recognized = deriveRegionalMysteryThread({
  ...base,
  exploration: { events: [{ kind: 'regional-thread-recognized', regionId: 'region-a', hiddenCoordinates: { x: 99 } }] },
});
assert.equal(recognized.active, false, 'already-recognized region must not replay recognition');
assert.equal(recognized.recognized, true);

const secretInput = {
  ...base,
  world: structuredClone(world),
  secretRoute: 'hidden-route',
  coordinates: { x: 999, z: -999 },
};
const before = JSON.stringify(secretInput);
const publicState = regionalMysteryThreadPublicState(deriveRegionalMysteryThread(secretInput));
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'recognized', 'threadClass']);
assert.equal(JSON.stringify(publicState).includes('secret'), false);
assert.equal(JSON.stringify(publicState).includes('999'), false);
assert.equal(JSON.stringify(secretInput), before, 'caller input must remain immutable');

const malformed = regionalMysteryThreadPublicState(deriveRegionalMysteryThread({
  world: { islands: [{ id: { bad: true }, regionId: 4 }] },
  currentRegionId: { secret: true },
  discoveredIslandIds: ['isle-a'],
  investigatedLandmarkIds: ['landmark-a'],
  listenRequested: true,
}));
assert.deepEqual(malformed, { active: false, recognized: false, threadClass: null });

console.log('regional-mystery-thread regressions passed');
