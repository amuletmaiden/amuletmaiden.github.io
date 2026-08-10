import assert from 'node:assert/strict';
import {
  advanceRegionalMysterySearchFlight,
  createRegionalMysterySearchFlightState,
  eligibleRegionalMysterySearchFocuses,
  regionalMysterySearchFlightPublicState,
} from '../src/core/regional-mystery-search-flight.js';

const world = {
  islands: [
    { id: 'isle-a', regionId: 'region-a', x: 0, z: 0, height: 80, landmarkRecord: { id: 'landmark-a' } },
    { id: 'isle-b', regionId: 'region-a', x: 500, z: 0, height: 90, landmarkRecord: { id: 'landmark-b' } },
    { id: 'isle-hidden', regionId: 'region-a', x: 900, z: 0, height: 70, landmarkRecord: { id: 'landmark-hidden' } },
    { id: 'isle-other', regionId: 'region-b', x: 1200, z: 0, height: 100, landmarkRecord: { id: 'landmark-other' } },
  ],
};

const focusInput = {
  world,
  currentRegionId: 'region-a',
  discoveredIslandIds: ['isle-a', 'isle-b'],
  investigatedLandmarkIds: ['landmark-a', 'landmark-b', 'landmark-hidden'],
  threadClass: 'relic',
};
const before = JSON.stringify(focusInput);
const focuses = eligibleRegionalMysterySearchFocuses(focusInput);
assert.equal(focuses.length, 2, 'only discovered + investigated current-region landmarks qualify');
assert.equal(focuses.some((focus) => focus.landmarkId === 'landmark-hidden'), false, 'hidden landmark must be excluded');
assert.equal(JSON.stringify(focusInput), before, 'focus derivation must not mutate caller/world');
assert.deepEqual(
  eligibleRegionalMysterySearchFocuses({ ...focusInput, discoveredIslandIds: ['isle-b', 'isle-a'] }).map((focus) => focus.landmarkId),
  focuses.map((focus) => focus.landmarkId),
  'focus ordering must be deterministic',
);

const target = focuses[0];
const start = { x: target.x + 520, y: target.y + 40, z: target.z };
let state = advanceRegionalMysterySearchFlight(createRegionalMysterySearchFlightState(), {
  focuses,
  recognized: true,
  ready: true,
  airborne: true,
  position: start,
});
assert.equal(state.active, true);
assert.equal(state.focusLandmarkId, target.landmarkId);

const repeated = advanceRegionalMysterySearchFlight(state, {
  focuses,
  recognized: true,
  ready: true,
  airborne: true,
  position: { ...start },
});
assert.equal(repeated.travel, 0, 'republication/hover must not progress');

const wrongWay = advanceRegionalMysterySearchFlight(state, {
  focuses,
  recognized: true,
  ready: true,
  airborne: true,
  position: { x: start.x + 40, y: start.y, z: start.z },
});
assert.equal(wrongWay.active, false, 'meaningful travel away from the focus resets the attempt');

for (const offset of [430, 340, 250, 170]) {
  state = advanceRegionalMysterySearchFlight(state, {
    focuses,
    recognized: true,
    ready: true,
    airborne: true,
    position: { x: target.x + offset, y: target.y + 30, z: target.z },
  });
}
assert.equal(state.completed, true, 'meaningful closing travel into natural proximity completes the search');
assert.equal(state.phase, 'arrive');

const publicState = regionalMysterySearchFlightPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
assert.equal(JSON.stringify(publicState).includes(target.landmarkId), false, 'public state must strip focus identity');
assert.equal(JSON.stringify(publicState).includes(String(target.x)), false, 'public state must strip coordinates');

for (const patch of [
  { recognized: false },
  { ready: false },
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
  { position: { x: NaN, y: 0, z: 0 } },
]) {
  const interrupted = advanceRegionalMysterySearchFlight(createRegionalMysterySearchFlightState(), {
    focuses,
    recognized: true,
    ready: true,
    airborne: true,
    position: start,
    ...patch,
  });
  assert.equal(interrupted.active, false, 'interruption/malformed telemetry must fail closed');
}

const changedFocuses = focuses.filter((focus) => focus.landmarkId !== target.landmarkId);
const continuityReset = advanceRegionalMysterySearchFlight(
  advanceRegionalMysterySearchFlight(createRegionalMysterySearchFlightState(), {
    focuses,
    recognized: true,
    ready: true,
    airborne: true,
    position: start,
  }),
  {
    focuses: changedFocuses,
    recognized: true,
    ready: true,
    airborne: true,
    position: { x: start.x - 80, y: start.y, z: start.z },
  },
);
assert.equal(continuityReset.active, false, 'candidate switching cannot silently continue an attempt');

const malformed = eligibleRegionalMysterySearchFocuses({
  world: { islands: [{ id: {}, regionId: 'region-a', x: 'secret', landmarkRecord: { id: [] } }] },
  currentRegionId: 'region-a',
  discoveredIslandIds: ['x'],
  investigatedLandmarkIds: ['y'],
  threadClass: 'chorus',
});
assert.deepEqual(malformed, []);

console.log('regional-mystery-search-flight regressions passed');
