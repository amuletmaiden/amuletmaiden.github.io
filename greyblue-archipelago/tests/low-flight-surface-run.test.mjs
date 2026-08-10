import assert from 'node:assert/strict';
import {
  createLowFlightSurfaceRunState,
  stepLowFlightSurfaceRun,
  lowFlightSurfaceRunPublicState,
} from '../src/core/low-flight-surface-run.js';

function wake(runClass, x) {
  return { wakeClass: runClass, samples: [{ x, y: 4, z: 0 }] };
}

let state = createLowFlightSurfaceRunState();
state = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 0) });
assert.deepEqual(lowFlightSurfaceRunPublicState(state, wake('water', 0)), {
  available: true, active: true, phase: 'entry', completed: false, runClass: 'water',
});

const repeated = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 4) });
assert.equal(repeated.progress, state.progress);

state = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 30) });
assert.equal(lowFlightSurfaceRunPublicState(state, wake('water', 30)).phase, 'sustained');
state = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 60) });
state = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 90) });
assert.equal(lowFlightSurfaceRunPublicState(state, wake('water', 90)).phase, 'final');
state = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 120) });
assert.equal(lowFlightSurfaceRunPublicState(state, wake('water', 120)).completed, true);

const latched = stepLowFlightSurfaceRun({ state, wakeState: wake('water', 180) });
assert.equal(latched.completed, true);
assert.equal(latched.progress, 0);

const switched = stepLowFlightSurfaceRun({
  state: { runClass: 'water', progress: 3, anchor: { x: 60, y: 4, z: 0 }, completed: false },
  wakeState: wake('mist', 95),
});
assert.equal(switched.runClass, 'mist');
assert.equal(switched.progress, 1);

const interrupted = stepLowFlightSurfaceRun({ state: switched, wakeState: wake('mist', 130), interrupted: true });
assert.deepEqual(lowFlightSurfaceRunPublicState(interrupted, { wakeClass: null, samples: [] }), {
  available: false, active: false, phase: null, completed: false, runClass: null,
});

const malformed = stepLowFlightSurfaceRun({
  state: createLowFlightSurfaceRunState(),
  wakeState: { wakeClass: 'water', samples: [{ x: NaN, y: 0, z: 0 }] },
});
assert.equal(lowFlightSurfaceRunPublicState(malformed, {}).active, false);

const publicState = lowFlightSurfaceRunPublicState(switched, wake('mist', 95));
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase', 'runClass']);
assert.equal('progress' in publicState, false);
assert.equal('anchor' in publicState, false);
assert.equal('distance' in publicState, false);

const caller = wake('water', 0);
const before = JSON.stringify(caller);
stepLowFlightSurfaceRun({ state: createLowFlightSurfaceRunState(), wakeState: caller });
assert.equal(JSON.stringify(caller), before);
