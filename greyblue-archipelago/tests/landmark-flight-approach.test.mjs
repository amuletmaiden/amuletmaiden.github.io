import assert from 'node:assert/strict';
import { evaluateLandmarkFlightApproach } from '../src/core/landmark-flight-approach.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const world = deepFreeze({
  islands: [{
    id: 'isle-a',
    x: 100,
    z: 100,
    landmarkRecord: {
      id: 'isle-a:landmark',
      title: 'The Listening Needle · drowned bell',
      encounter: {
        id: 'isle-a:encounter',
        class: 'resonance',
        triggerRadius: 200,
        approachBearing: Math.PI * 2 - 0.05,
        minimumAltitude: 80,
        revealText: 'The bell answers the rain.',
        repeatable: false,
      },
    },
  }],
});

const base = {
  world,
  discoveredIslandIds: ['isle-a'],
  investigatedLandmarkIds: [],
  position: { x: 100, y: 120, z: 250 },
  altitude: 120,
  heading: 0.04,
  forwardSpeed: 24,
  now: 100000,
};

const success = evaluateLandmarkFlightApproach(base);
assert.equal(success.visible, true);
assert.equal(success.status, 'awakened');
assert.equal(success.shouldInvestigate, true);
assert.equal(success.landmarkId, 'isle-a:landmark');
assert.equal(success.encounterClass, 'resonance');
assert.equal(success.revealText, 'The bell answers the rain.');
assert.ok(success.headingError < 0.1, 'heading wraparound is treated as a small error');

const outside = evaluateLandmarkFlightApproach({
  ...base,
  position: { x: 100, y: 120, z: 370 },
});
assert.equal(outside.visible, true);
assert.equal(outside.status, 'aligned');
assert.equal(outside.shouldInvestigate, false);

const tooFar = evaluateLandmarkFlightApproach({
  ...base,
  position: { x: 100, y: 120, z: 500 },
});
assert.equal(tooFar.visible, false);
assert.equal(tooFar.reason, 'no-discovered-landmark-nearby');

const undiscovered = evaluateLandmarkFlightApproach({
  ...base,
  discoveredIslandIds: [],
});
assert.equal(undiscovered.visible, false);
assert.equal(undiscovered.shouldInvestigate, false);

const tooLow = evaluateLandmarkFlightApproach({ ...base, altitude: 79 });
assert.equal(tooLow.status, 'too-low');
assert.equal(tooLow.shouldInvestigate, false);

const wrongHeading = evaluateLandmarkFlightApproach({ ...base, heading: Math.PI });
assert.equal(wrongHeading.status, 'seeking');
assert.equal(wrongHeading.shouldInvestigate, false);

const hovering = evaluateLandmarkFlightApproach({ ...base, forwardSpeed: 2 });
assert.equal(hovering.status, 'seeking');
assert.equal(hovering.shouldInvestigate, false);

const remembered = evaluateLandmarkFlightApproach({
  ...base,
  investigatedLandmarkIds: ['isle-a:landmark'],
});
assert.equal(remembered.status, 'awakened');
assert.equal(remembered.shouldInvestigate, false);
assert.equal(remembered.alreadyInvestigated, true);

const repeatableWorld = deepFreeze({
  islands: [{
    id: 'isle-r',
    x: 0,
    z: 0,
    landmarkRecord: {
      id: 'repeatable-landmark',
      encounter: {
        class: 'instrument',
        triggerRadius: 180,
        approachBearing: 0,
        minimumAltitude: 40,
        revealText: 'A lens turns in the fog.',
        repeatable: true,
      },
    },
  }],
});
const repeatBase = {
  world: repeatableWorld,
  discoveredIslandIds: ['isle-r'],
  investigatedLandmarkIds: ['repeatable-landmark'],
  position: { x: 0, y: 60, z: 100 },
  altitude: 60,
  heading: 0,
  forwardSpeed: 20,
  now: 30000,
  repeatCooldownMs: 15000,
};
assert.equal(evaluateLandmarkFlightApproach({ ...repeatBase, lastTriggeredAt: 20000 }).shouldInvestigate, false);
assert.equal(evaluateLandmarkFlightApproach({ ...repeatBase, lastTriggeredAt: 10000 }).shouldInvestigate, true);

const malformed = evaluateLandmarkFlightApproach({
  ...base,
  world: { islands: [{ id: 'bad', x: 0, z: 0, landmarkRecord: { id: 'bad-landmark', encounter: { triggerRadius: -2 } } }] },
  discoveredIslandIds: ['bad'],
});
assert.equal(malformed.visible, false);
assert.equal(malformed.shouldInvestigate, false);

assert.equal(Object.isFrozen(world), true);
assert.equal(world.islands[0].landmarkRecord.encounter.triggerRadius, 200);
console.log('landmark flight approach tests passed');
