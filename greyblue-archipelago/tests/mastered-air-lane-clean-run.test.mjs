import assert from 'node:assert/strict';
import {
  createMasteredAirLaneCleanRunState,
  stepMasteredAirLaneCleanRun,
  masteredAirLaneCleanRunPublicState,
  masteredAirLaneCleanRunPresentationPolicy,
} from '../src/core/mastered-air-lane-clean-run.js';

const trace = Object.freeze([
  Object.freeze({ x: 0, y: 120, z: 0 }),
  Object.freeze({ x: 250, y: 110, z: 0 }),
  Object.freeze({ x: 500, y: 100, z: 0 }),
  Object.freeze({ x: 750, y: 90, z: 0 }),
  Object.freeze({ x: 1000, y: 80, z: 0 }),
]);
const lane = Object.freeze({ corridorId: 'c-1', trace });
const lanes = Object.freeze([lane]);

function step(state, position, extra = {}) {
  return stepMasteredAirLaneCleanRun({
    state,
    lanes,
    position,
    speed: 30,
    airborne: true,
    ...extra,
  });
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  assert.equal(state.status, 'idle');
  state = step(state, { x: 0, y: 120, z: 0 });
  assert.equal(state.status, 'active');
  assert.equal(state.nextGateIndex, 1);
  assert.deepEqual(masteredAirLaneCleanRunPublicState(state, lanes), {
    available: true,
    active: true,
    phase: 'entry',
    completed: false,
  });
}

{
  const spawnedInside = stepMasteredAirLaneCleanRun({
    state: createMasteredAirLaneCleanRunState(),
    lanes,
    position: trace[0],
    speed: 30,
  });
  assert.equal(spawnedInside.status, 'idle');
  const next = stepMasteredAirLaneCleanRun({ state: spawnedInside, lanes, position: trace[0], speed: 30 });
  assert.equal(next.status, 'idle');
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = stepMasteredAirLaneCleanRun({ state, lanes, position: { x: -100, y: 120, z: 0 }, speed: 5 });
  state = stepMasteredAirLaneCleanRun({ state, lanes, position: trace[0], speed: 5 });
  assert.equal(state.status, 'idle');
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  state = step(state, trace[1]);
  assert.equal(state.nextGateIndex, 2);
  assert.equal(masteredAirLaneCleanRunPublicState(state, lanes).phase, 'middle');
  state = step(state, trace[2]);
  assert.equal(state.nextGateIndex, 3);
  state = step(state, trace[3]);
  assert.equal(state.nextGateIndex, 4);
  assert.equal(masteredAirLaneCleanRunPublicState(state, lanes).phase, 'final');
  state = step(state, trace[4]);
  assert.equal(state.status, 'completed');
  assert.deepEqual(masteredAirLaneCleanRunPublicState(state, lanes), {
    available: false,
    active: false,
    phase: null,
    completed: true,
  });
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  state = step(state, trace[3]);
  assert.equal(state.status, 'idle');
  assert.equal(state.completed, false);
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  state = step(state, { x: 250, y: 110, z: 90 });
  assert.equal(state.nextGateIndex, 1);
  assert.equal(state.status, 'active');
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  state = step(state, trace[1]);
  state = step(state, trace[2]);
  state = step(state, { x: 180, y: 110, z: 0 });
  assert.equal(state.status, 'idle');
}

{
  for (const flag of ['recoveryActive', 'crossingActive', 'restorePublishing']) {
    let state = createMasteredAirLaneCleanRunState();
    state = step(state, { x: -100, y: 120, z: 0 });
    state = step(state, trace[0]);
    state = step(state, trace[1], { [flag]: true });
    assert.equal(state.status, 'idle', flag);
    assert.equal(state.completed, false, flag);
  }
}

{
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  for (let index = 1; index < trace.length; index += 1) state = step(state, trace[index]);
  const after = step(state, trace[4]);
  assert.equal(after.completed, true);
  assert.equal(after.status, 'completed');
}

{
  const malformed = stepMasteredAirLaneCleanRun({
    state: { status: 'active', corridorId: 'x', nextGateIndex: 99 },
    lanes: [{ corridorId: '', trace: [{ x: NaN }] }],
    position: { x: Infinity, y: 0, z: 0 },
    speed: Infinity,
  });
  assert.equal(malformed.status, 'idle');
  assert.deepEqual(masteredAirLaneCleanRunPublicState(malformed, lanes), {
    available: true,
    active: false,
    phase: null,
    completed: false,
  });
}

{
  const original = JSON.stringify(lanes);
  let state = createMasteredAirLaneCleanRunState();
  state = step(state, { x: -100, y: 120, z: 0 });
  state = step(state, trace[0]);
  assert.equal(JSON.stringify(lanes), original);
  const publicState = masteredAirLaneCleanRunPublicState(state, lanes);
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'phase']);
  assert.equal('corridorId' in publicState, false);
  assert.equal('nextGateIndex' in publicState, false);
}

{
  assert.deepEqual(masteredAirLaneCleanRunPresentationPolicy({ reducedMotion: true, mutedAudio: true }), {
    reducedMotion: true,
    mutedAudio: true,
    atmosphereDurationMs: 1200,
    soundHook: null,
  });
  assert.deepEqual(masteredAirLaneCleanRunPresentationPolicy({ reducedMotion: false, mutedAudio: false }), {
    reducedMotion: false,
    mutedAudio: false,
    atmosphereDurationMs: 2200,
    soundHook: 'mastered-air-lane-clean-run',
  });
}

console.log('mastered-air-lane-clean-run regressions defined');
