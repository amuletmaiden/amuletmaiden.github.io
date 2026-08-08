import assert from 'node:assert/strict';
import { masteryFromChallengeEvent } from '../src/core/approach-mastery.js';

const discovered = Object.freeze(['isle-a', 'isle-b']);
const succeeded = Object.freeze({ phase: 'succeeded', islandId: 'isle-a', corridorId: 'corridor-a' });
const detail = Object.freeze({ kind: 'succeeded', islandId: 'isle-a', corridorId: 'corridor-a' });

assert.deepEqual(
  masteryFromChallengeEvent({ eventDetail: detail, discoveredIslandIds: discovered, approachChallenge: succeeded }),
  { islandId: 'isle-a', corridorId: 'corridor-a' },
  'truthful success on a discovered island produces mastery',
);
assert.equal(masteryFromChallengeEvent({ eventDetail: { ...detail, kind: 'broken' }, discoveredIslandIds: discovered, approachChallenge: succeeded }), null, 'broken attempts never count');
assert.equal(masteryFromChallengeEvent({ eventDetail: detail, discoveredIslandIds: [], approachChallenge: succeeded }), null, 'hidden or unknown islands never count');
assert.equal(masteryFromChallengeEvent({ eventDetail: detail, discoveredIslandIds: discovered, approachChallenge: { ...succeeded, phase: 'broken' } }), null, 'non-success active state never counts');
assert.equal(masteryFromChallengeEvent({ eventDetail: detail, discoveredIslandIds: discovered, approachChallenge: { ...succeeded, corridorId: 'other' } }), null, 'event and live challenge must identify the same corridor');
assert.equal(masteryFromChallengeEvent({ eventDetail: { kind: 'succeeded', islandId: 'isle-a', corridorId: '' }, discoveredIslandIds: discovered, approachChallenge: succeeded }), null, 'malformed ids fail closed');

const discoveredBefore = JSON.stringify(discovered);
const detailBefore = JSON.stringify(detail);
const stateBefore = JSON.stringify(succeeded);
masteryFromChallengeEvent({ eventDetail: detail, discoveredIslandIds: discovered, approachChallenge: succeeded });
assert.equal(JSON.stringify(discovered), discoveredBefore, 'discovered ids are not mutated');
assert.equal(JSON.stringify(detail), detailBefore, 'event detail is not mutated');
assert.equal(JSON.stringify(succeeded), stateBefore, 'challenge state is not mutated');

console.log('approach-mastery tests passed');
