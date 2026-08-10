import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTerrainRidgeRunState,
  stepTerrainRidgeRun,
  terrainRidgeRunPublicState,
} from '../src/core/terrain-ridge-run.js';

function frame(x = 0, skimClass = 'near') {
  return {
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    restorePublishing: false,
    position: { x, y: 20, z: 0 },
    skim: { active: true, skimClass },
  };
}

test('starts only from truthful active terrain skim state', () => {
  const started = stepTerrainRidgeRun({ state: createTerrainRidgeRunState(), frame: frame() });
  assert.equal(started.active, true);
  assert.equal(started.phase, 'entry');

  for (const patch of [
    { ready: false },
    { paused: true },
    { airborne: false },
    { recoveryActive: true },
    { restorePublishing: true },
    { skim: { active: false, skimClass: null } },
  ]) {
    const rejected = stepTerrainRidgeRun({
      state: createTerrainRidgeRunState(),
      frame: { ...frame(), ...patch },
    });
    assert.equal(rejected.active, false);
    assert.equal(rejected.completed, false);
  }
});

test('hover and repeated publication cannot advance the run', () => {
  const started = stepTerrainRidgeRun({ state: createTerrainRidgeRunState(), frame: frame(0) });
  const repeated = stepTerrainRidgeRun({ state: started, frame: frame(0) });
  const shallow = stepTerrainRidgeRun({ state: repeated, frame: frame(10) });
  assert.equal(repeated.steps, 0);
  assert.equal(shallow.steps, 0);
  assert.equal(shallow.phase, 'entry');
});

test('meaningful spaced terrain skim travel completes one session-local ridge run', () => {
  let state = stepTerrainRidgeRun({ state: createTerrainRidgeRunState(), frame: frame(0) });
  for (const x of [20, 40, 60, 80]) state = stepTerrainRidgeRun({ state, frame: frame(x, 'close') });
  assert.equal(state.active, true);
  assert.equal(state.phase, 'final');
  state = stepTerrainRidgeRun({ state, frame: frame(100, 'razor') });
  assert.equal(state.completed, true);
  assert.equal(state.active, false);

  const latched = stepTerrainRidgeRun({ state, frame: frame(140) });
  assert.equal(latched.completed, true);
  assert.equal(latched.active, false);
});

test('interruption resets an incomplete attempt', () => {
  let state = stepTerrainRidgeRun({ state: createTerrainRidgeRunState(), frame: frame(0) });
  state = stepTerrainRidgeRun({ state, frame: frame(20) });
  const reset = stepTerrainRidgeRun({ state, frame: { ...frame(40), paused: true } });
  assert.deepEqual(terrainRidgeRunPublicState(reset), {
    available: false,
    active: false,
    phase: null,
    completed: false,
  });
});

test('malformed positions fail closed and public state stays bounded', () => {
  const malformed = stepTerrainRidgeRun({
    state: createTerrainRidgeRunState(),
    frame: { ...frame(), position: { x: Number.NaN, y: 20, z: 0 }, secret: 'nope' },
  });
  assert.deepEqual(Object.keys(terrainRidgeRunPublicState(malformed)), ['available', 'active', 'phase', 'completed']);
});
