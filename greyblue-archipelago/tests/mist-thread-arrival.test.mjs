import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMistThreadArrival,
  createMistThreadArrivalState,
  mistThreadArrivalPublicState,
} from '../src/core/mist-thread-arrival.js';

function sample(patch = {}) {
  return {
    hint: { active: true, candidateId: 'unknown-a', distance: 900 },
    discoveredIslandIds: [],
    position: { x: 0, z: 0 },
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    ...patch,
  };
}

function traceQualified() {
  let state = advanceMistThreadArrival(createMistThreadArrivalState(), sample());
  state = advanceMistThreadArrival(state, sample({ hint: { active: true, candidateId: 'unknown-a', distance: 830 }, position: { x: 70, z: 0 } }));
  state = advanceMistThreadArrival(state, sample({ hint: { active: true, candidateId: 'unknown-a', distance: 750 }, position: { x: 150, z: 0 } }));
  return state;
}

test('starts only from a truthful active hidden candidate', () => {
  const idle = createMistThreadArrivalState();
  assert.equal(advanceMistThreadArrival(idle, sample({ hint: { active: false, candidateId: 'unknown-a', distance: 900 } })).active, false);
  const started = advanceMistThreadArrival(idle, sample());
  assert.equal(started.active, true);
  assert.equal(started.targetId, 'unknown-a');
  assert.equal(started.phase, 'trace');
});

test('requires meaningful distance-closing world travel rather than hover or republication', () => {
  let state = advanceMistThreadArrival(createMistThreadArrivalState(), sample());
  state = advanceMistThreadArrival(state, sample({ hint: { active: true, candidateId: 'unknown-a', distance: 899 }, position: { x: 1, z: 0 } }));
  assert.equal(state.traceTravel, 0);
  assert.equal(state.qualified, false);
  state = advanceMistThreadArrival(state, sample({ hint: { active: true, candidateId: 'unknown-a', distance: 820 }, position: { x: 80, z: 0 } }));
  assert.equal(state.traceTravel > 0, true);
});

test('candidate change resets continuity onto the new hidden target', () => {
  const state = traceQualified();
  const changed = advanceMistThreadArrival(state, sample({ hint: { active: true, candidateId: 'unknown-b', distance: 700 }, position: { x: 180, z: 0 } }));
  assert.equal(changed.targetId, 'unknown-b');
  assert.equal(changed.traceTravel, 0);
  assert.equal(changed.qualified, false);
});

test('only canonical discovery of the same qualified target completes', () => {
  const state = traceQualified();
  assert.equal(state.qualified, true);
  const wrong = advanceMistThreadArrival(state, sample({ hint: { active: false }, discoveredIslandIds: ['unknown-b'], position: { x: 160, z: 0 } }));
  assert.equal(wrong.completed, false);

  const qualified = traceQualified();
  const arrived = advanceMistThreadArrival(qualified, sample({ hint: { active: false }, discoveredIslandIds: ['unknown-a'], position: { x: 160, z: 0 } }));
  assert.equal(arrived.completed, true);
  assert.equal(arrived.phase, 'arrival');
});

test('discovery before meaningful trace travel cannot manufacture completion', () => {
  const started = advanceMistThreadArrival(createMistThreadArrivalState(), sample());
  const result = advanceMistThreadArrival(started, sample({ hint: { active: false }, discoveredIslandIds: ['unknown-a'] }));
  assert.equal(result.completed, false);
});

test('interruptions reset incomplete progress and completed state is duplicate-stable', () => {
  for (const patch of [
    { paused: true },
    { airborne: false },
    { recoveryActive: true },
    { restorePublishing: true },
    { crossingActive: true },
    { position: { x: NaN, z: 0 } },
  ]) {
    const reset = advanceMistThreadArrival(traceQualified(), sample(patch));
    assert.equal(reset.active, false);
    assert.equal(reset.completed, false);
  }

  const arrived = advanceMistThreadArrival(traceQualified(), sample({ hint: { active: false }, discoveredIslandIds: ['unknown-a'] }));
  assert.deepEqual(advanceMistThreadArrival(arrived, sample({ paused: true })), arrived);
});

test('public state strips target identity, distance and progress', () => {
  const traced = traceQualified();
  assert.deepEqual(mistThreadArrivalPublicState(traced), { available: true, active: true, phase: 'trace', completed: false });
  assert.deepEqual(Object.keys(mistThreadArrivalPublicState(traced)), ['available', 'active', 'phase', 'completed']);
  assert.equal('targetId' in mistThreadArrivalPublicState(traced), false);
});

test('caller inputs remain unchanged', () => {
  const input = sample();
  const before = structuredClone(input);
  advanceMistThreadArrival(createMistThreadArrivalState(), input);
  assert.deepEqual(input, before);
});
