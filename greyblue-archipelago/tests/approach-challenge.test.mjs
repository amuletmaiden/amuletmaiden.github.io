import assert from 'node:assert/strict';
import { createApproachChallengeState, selectApproachCorridor, advanceApproachChallenge } from '../src/core/approach-challenge.js';

const island = Object.freeze({
  id: 'isle-a',
  landingZones: Object.freeze([{ id: 'lz', x: 0, y: 10, z: 0, radius: 60 }]),
  approachCorridors: Object.freeze([
    Object.freeze({
      id: 'c-a',
      entry: Object.freeze({ x: 0, y: 110, z: 300 }),
      touchdown: Object.freeze({ x: 0, y: 18, z: 20 }),
      heading: Math.PI,
      width: 100,
      minimumAltitude: 45,
    }),
  ]),
});

const sample = (z, options = {}) => ({
  island,
  corridor: island.approachCorridors[0],
  landingZone: island.landingZones[0],
  position: { x: options.x ?? 0, y: options.altitude ?? 90, z },
  altitude: options.altitude ?? 90,
  heading: options.heading ?? Math.PI,
  forwardSpeed: options.speed ?? 32,
  recovered: options.recovered ?? false,
  cancelled: options.cancelled ?? false,
  collision: options.collision ?? null,
});

assert.equal(selectApproachCorridor({ island, position: { x: 0, z: 350 }, heading: Math.PI, discoveredIslandIds: [] }), null, 'hidden destinations are never challenge candidates');
assert.equal(selectApproachCorridor({ island, position: { x: 0, z: 350 }, heading: Math.PI, discoveredIslandIds: ['isle-a'] })?.id, 'c-a', 'discovered corridor is selectable outside its entry');

let state = createApproachChallengeState();
state = advanceApproachChallenge(state, sample(350));
assert.equal(state.phase, 'armed', 'challenge arms only outside the corridor entry');
state = advanceApproachChallenge(state, sample(270));
assert.equal(state.phase, 'in-corridor', 'ordered entry advances into corridor');
state = advanceApproachChallenge(state, sample(85));
assert.equal(state.phase, 'final', 'late corridor progress enters final phase');
state = advanceApproachChallenge(state, sample(25));
assert.equal(state.phase, 'succeeded', 'clean ordered approach reaches success');

let wrongWay = advanceApproachChallenge(createApproachChallengeState(), sample(350, { heading: 0 }));
assert.equal(wrongWay.phase, 'idle', 'wrong-way flight does not arm');

let tooLow = advanceApproachChallenge(createApproachChallengeState(), sample(350));
tooLow = advanceApproachChallenge(tooLow, sample(260, { altitude: 20 }));
assert.equal(tooLow.phase, 'broken');
assert.equal(tooLow.reason, 'too-low');

let tooHigh = advanceApproachChallenge(createApproachChallengeState(), sample(350));
tooHigh = advanceApproachChallenge(tooHigh, sample(260, { altitude: 900 }));
assert.equal(tooHigh.reason, 'too-high');

let recovery = advanceApproachChallenge(createApproachChallengeState(), sample(350));
recovery = advanceApproachChallenge(recovery, sample(260, { recovered: true }));
assert.equal(recovery.reason, 'recovery', 'recovery invalidates an active challenge');

let cancelled = advanceApproachChallenge(createApproachChallengeState(), sample(350));
cancelled = advanceApproachChallenge(cancelled, sample(260, { cancelled: true }));
assert.equal(cancelled.reason, 'cancelled', 'route cancellation invalidates an active challenge');

let reversing = advanceApproachChallenge(createApproachChallengeState(), sample(350));
reversing = advanceApproachChallenge(reversing, sample(230));
reversing = advanceApproachChallenge(reversing, sample(270));
assert.equal(reversing.reason, 'reversed', 'reversing through the corridor does not count');

const multiIsland = {
  ...island,
  approachCorridors: [
    { ...island.approachCorridors[0], id: 'z-corridor', entry: { x: 10, y: 110, z: 340 } },
    { ...island.approachCorridors[0], id: 'a-corridor', entry: { x: -10, y: 110, z: 340 } },
  ],
};
assert.equal(
  selectApproachCorridor({ island: multiIsland, position: { x: 0, z: 360 }, heading: Math.PI, discoveredIslandIds: ['isle-a'] })?.id,
  'a-corridor',
  'equal corridor candidates resolve with stable id ordering',
);

assert.equal(selectApproachCorridor({ island: { id: 'bad', approachCorridors: [{}] }, position: { x: 0, z: 0 }, heading: 0, discoveredIslandIds: ['bad'] }), null, 'malformed metadata fails closed');
const before = JSON.stringify(island);
advanceApproachChallenge(createApproachChallengeState(), sample(350));
assert.equal(JSON.stringify(island), before, 'caller-owned island metadata remains unchanged');

console.log('approach-challenge tests passed');
