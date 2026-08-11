import assert from 'node:assert/strict';
import {
  cancelKnownVoyageIntention,
  createKnownVoyageIntentionState,
  publicKnownVoyageIntention,
  selectKnownVoyageIntention,
  stepKnownVoyageIntention,
} from '../src/core/known-voyage-intention.js';

const knownNodes = Object.freeze([
  Object.freeze({ id: 'a', name: 'Aster', regionId: 'reach' }),
  Object.freeze({ id: 'b', name: 'Bell', regionId: 'crown' }),
]);

const idle = createKnownVoyageIntentionState();
assert.deepEqual(publicKnownVoyageIntention(idle), { active: false, phase: 'idle', completed: false, text: '' });
assert.equal(selectKnownVoyageIntention({ state: idle, candidate: { id: 'secret', regionId: 'hidden' }, knownNodes }), idle);

const selected = selectKnownVoyageIntention({ state: idle, candidate: { id: 'b', regionId: 'crown' }, knownNodes });
assert.equal(selected.targetId, 'b');
assert.equal(selected.phase, 'depart');
assert.equal(selected.departed, false);
assert.deepEqual(publicKnownVoyageIntention(selected), {
  active: true,
  phase: 'depart',
  completed: false,
  text: 'Take wing when you are ready.',
});
assert.equal(JSON.stringify(publicKnownVoyageIntention(selected)).includes('Bell'), false);
assert.equal(JSON.stringify(publicKnownVoyageIntention(selected)).includes('crown'), false);
assert.equal(JSON.stringify(publicKnownVoyageIntention(selected)).includes('b'), false);

const paused = stepKnownVoyageIntention(selected, {
  ready: true, paused: true, airborne: true, ordinaryFlight: true, nearestIslandId: 'a', currentRegionId: 'reach',
});
assert.equal(paused, selected);

const notDepartedAtTarget = stepKnownVoyageIntention(selected, {
  ready: true, airborne: true, ordinaryFlight: true, nearestIslandId: 'b', currentRegionId: 'crown',
});
assert.equal(notDepartedAtTarget.departed, false);

const underway = stepKnownVoyageIntention(selected, {
  ready: true, airborne: true, grounded: false, ordinaryFlight: true, nearestIslandId: 'a', currentRegionId: 'reach',
});
assert.equal(underway.departed, true);
assert.equal(underway.phase, 'underway');

const wrongIsland = stepKnownVoyageIntention(underway, {
  ready: true, airborne: true, ordinaryFlight: true, nearestIslandId: 'a', currentRegionId: 'crown', arrivedAtNearestIsland: true,
});
assert.equal(wrongIsland.completed, false);

const wrongRegion = stepKnownVoyageIntention(underway, {
  ready: true, grounded: true, ordinaryFlight: true, nearestIslandId: 'b', currentRegionId: 'reach', arrivedAtNearestIsland: true,
});
assert.equal(wrongRegion.completed, false);

const arrived = stepKnownVoyageIntention(underway, {
  ready: true, grounded: true, ordinaryFlight: true, nearestIslandId: 'b', currentRegionId: 'crown', arrivedAtNearestIsland: true,
});
assert.equal(arrived.completed, true);
assert.equal(arrived.phase, 'arrived');
assert.deepEqual(publicKnownVoyageIntention(arrived), {
  active: false,
  phase: 'arrived',
  completed: true,
  text: 'Voyage complete.',
});

assert.deepEqual(stepKnownVoyageIntention(underway, { recovery: true }), idle);
assert.deepEqual(stepKnownVoyageIntention(underway, { restorePublishing: true }), idle);
assert.deepEqual(cancelKnownVoyageIntention(), idle);

const replaced = selectKnownVoyageIntention({ state: underway, candidate: { id: 'a', regionId: 'reach' }, knownNodes });
assert.equal(replaced.targetId, 'a');
assert.equal(replaced.departed, false);
assert.equal(replaced.phase, 'depart');

const caller = { ready: true, airborne: true, ordinaryFlight: true, nearestIslandId: 'a', currentRegionId: 'reach' };
const before = JSON.stringify(caller);
stepKnownVoyageIntention(selected, caller);
assert.equal(JSON.stringify(caller), before);

console.log('known-voyage-intention regressions: ok');
