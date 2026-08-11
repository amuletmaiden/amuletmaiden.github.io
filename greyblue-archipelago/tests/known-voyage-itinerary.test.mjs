import assert from 'node:assert/strict';
import {
  addKnownVoyageItineraryStop,
  advanceKnownVoyageItinerary,
  cancelKnownVoyageItinerary,
  createKnownVoyageItineraryState,
  currentKnownVoyageItineraryStop,
  launchKnownVoyageItinerary,
  publicKnownVoyageItinerary,
  removeKnownVoyageItineraryStop,
  resetKnownVoyageItineraryForInterruption,
  reverseKnownVoyageItinerary,
} from '../src/core/known-voyage-itinerary.js';

const knownNodes = Object.freeze([
  Object.freeze({ id: 'a', name: 'Aster', regionId: 'reach' }),
  Object.freeze({ id: 'b', name: 'Bell', regionId: 'crown' }),
  Object.freeze({ id: 'c', name: 'Cairn', regionId: 'veil' }),
]);

const idle = createKnownVoyageItineraryState();
assert.deepEqual(publicKnownVoyageItinerary(idle), { active: false, phase: 'idle', completed: false });
assert.equal(addKnownVoyageItineraryStop({ state: idle, candidate: { id: 'secret' }, knownNodes }), idle);

const one = addKnownVoyageItineraryStop({ state: idle, candidate: { id: 'a' }, knownNodes });
assert.equal(one.stops.length, 1);
assert.equal(one.stops[0].id, 'a');
assert.deepEqual(publicKnownVoyageItinerary(one), { active: false, phase: 'planning', completed: false });

const two = addKnownVoyageItineraryStop({ state: one, candidate: { id: 'b' }, knownNodes });
assert.deepEqual(two.stops.map((stop) => stop.id), ['a', 'b']);
assert.equal(addKnownVoyageItineraryStop({ state: two, candidate: { id: 'c' }, knownNodes }), two);
assert.equal(addKnownVoyageItineraryStop({ state: two, candidate: { id: 'a' }, knownNodes }), two);

const reversed = reverseKnownVoyageItinerary(two);
assert.deepEqual(reversed.stops.map((stop) => stop.id), ['b', 'a']);
const removed = removeKnownVoyageItineraryStop(reversed, 'b');
assert.deepEqual(removed.stops.map((stop) => stop.id), ['a']);

const launched = launchKnownVoyageItinerary(two);
assert.deepEqual(publicKnownVoyageItinerary(launched), { active: true, phase: 'first-leg', completed: false });
assert.equal(currentKnownVoyageItineraryStop(launched).id, 'a');
assert.equal(removeKnownVoyageItineraryStop(launched, 'a'), launched);
assert.equal(reverseKnownVoyageItinerary(launched), launched);

const noise = advanceKnownVoyageItinerary(launched, { event: 'completed', completed: true, phase: 'underway' });
assert.equal(noise, launched);
const secondLeg = advanceKnownVoyageItinerary(launched, { event: 'completed', completed: true, phase: 'arrived' });
assert.deepEqual(publicKnownVoyageItinerary(secondLeg), { active: true, phase: 'second-leg', completed: false });
assert.equal(currentKnownVoyageItineraryStop(secondLeg).id, 'b');

const complete = advanceKnownVoyageItinerary(secondLeg, { event: 'completed', completed: true, phase: 'arrived' });
assert.deepEqual(publicKnownVoyageItinerary(complete), { active: false, phase: 'complete', completed: true });
assert.equal(currentKnownVoyageItineraryStop(complete), null);

assert.deepEqual(resetKnownVoyageItineraryForInterruption(launched, { recovery: true }), idle);
assert.deepEqual(resetKnownVoyageItineraryForInterruption(launched, { restorePublishing: true }), idle);
assert.equal(resetKnownVoyageItineraryForInterruption(launched, { paused: true }), launched);
assert.deepEqual(cancelKnownVoyageItinerary(), idle);

assert.equal(JSON.stringify(publicKnownVoyageItinerary(secondLeg)).includes('Bell'), false);
assert.equal(JSON.stringify(publicKnownVoyageItinerary(secondLeg)).includes('crown'), false);
assert.equal(JSON.stringify(publicKnownVoyageItinerary(secondLeg)).includes('b'), false);

const caller = { event: 'completed', completed: true, phase: 'arrived', targetId: 'private' };
const before = JSON.stringify(caller);
advanceKnownVoyageItinerary(launched, caller);
assert.equal(JSON.stringify(caller), before);

console.log('known-voyage-itinerary regressions: ok');
