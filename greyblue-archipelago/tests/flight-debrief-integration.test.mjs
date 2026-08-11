import assert from 'node:assert/strict';
import {
  FLIGHT_DEBRIEF_COMPLETION_EVENTS,
  flightDebriefCategoryForEvent,
  flightDebriefLandingForEvent,
  flightDebriefRuntimePolicy,
} from '../src/core/flight-debrief-integration.js';

assert.equal(FLIGHT_DEBRIEF_COMPLETION_EVENTS.includes('greyblue:full-column-weather-run'), true);
assert.equal(flightDebriefCategoryForEvent('greyblue:full-column-weather-run', { completed: true }), 'weather');
assert.equal(flightDebriefCategoryForEvent('greyblue:high-air-landfall', { completed: true }), 'crossing');
assert.equal(flightDebriefCategoryForEvent('greyblue:mystery-listening-pass', { completed: true }), 'mystery');
assert.equal(flightDebriefCategoryForEvent('greyblue:terrain-ridge-run', { completed: true }), 'terrain');
assert.equal(flightDebriefCategoryForEvent('greyblue:low-flight-surface-run', { completed: true }), 'low-flight');
assert.equal(flightDebriefCategoryForEvent('greyblue:high-air-landfall', { completed: false }), null);
assert.equal(flightDebriefCategoryForEvent('greyblue:hidden-target', { completed: true, targetId: 'secret' }), null);

const airborne = flightDebriefRuntimePolicy({
  ready: true,
  paused: false,
  flight: { airborne: true, mode: 'flight' },
  collision: { grounded: false, requiresRecovery: false },
});
assert.deepEqual(airborne, { airborne: true, safe: true, restoring: false, recovering: false });
assert.equal(flightDebriefLandingForEvent('greyblue:precision-touchdown', { completed: true }, airborne), true);
assert.equal(flightDebriefLandingForEvent('greyblue:roost-rest', { resting: true, beganRest: true }, airborne), true);
assert.equal(flightDebriefLandingForEvent('greyblue:roost-rest', { resting: true, beganRest: false }, airborne), false);

const restoring = flightDebriefRuntimePolicy({
  ready: true,
  restorePublishing: true,
  flight: { airborne: true },
  collision: { grounded: false },
});
assert.equal(restoring.airborne, false);
assert.equal(restoring.restoring, true);
assert.equal(flightDebriefLandingForEvent('greyblue:precision-touchdown', { completed: true }, restoring), false);

const recovering = flightDebriefRuntimePolicy({
  ready: true,
  flight: { airborne: true, mode: 'recovery' },
  collision: { grounded: false, requiresRecovery: true },
});
assert.equal(recovering.recovering, true);
assert.equal(recovering.safe, false);

const grounded = flightDebriefRuntimePolicy({
  ready: true,
  flight: { airborne: false },
  collision: { grounded: true, requiresRecovery: false },
});
assert.equal(grounded.airborne, false);
assert.equal(grounded.safe, true);

console.log('flight-debrief integration regressions: ok');
