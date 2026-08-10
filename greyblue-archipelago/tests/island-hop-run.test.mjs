import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIslandHopRunState,
  finishIslandHopRun,
  islandHopRunPublicState,
  startIslandHopRun,
  stepIslandHopRun,
} from '../src/core/island-hop-run.js';

const pos = (x, y = 40, z = 0) => ({ x, y, z });
const frame = (position, patch = {}) => ({
  ready: true,
  paused: false,
  recoveryActive: false,
  restorePublishing: false,
  crossingActive: false,
  airborne: true,
  position,
  ...patch,
});

test('starts only from truthful touch-and-go completion with finite position', () => {
  const initial = createIslandHopRunState();
  assert.equal(startIslandHopRun(initial, { completed: false }, pos(0)), initial);
  assert.equal(startIslandHopRun(initial, { completed: true }, { x: NaN, y: 0, z: 0 }), initial);
  const started = startIslandHopRun(initial, { completed: true }, pos(0));
  assert.deepEqual(islandHopRunPublicState(started), { available: true, active: true, phase: 'depart', completed: false });
});

test('requires meaningful spaced cruise travel before arrival can complete', () => {
  let state = startIslandHopRun(createIslandHopRunState(), { completed: true }, pos(0));
  state = stepIslandHopRun({ state, frame: frame(pos(5)) });
  state = stepIslandHopRun({ state, frame: frame(pos(10)) });
  assert.equal(state.travel, 0);
  assert.equal(finishIslandHopRun(state, { completed: true }), state);

  for (const x of [40, 80, 120, 160, 205]) state = stepIslandHopRun({ state, frame: frame(pos(x)) });
  assert.equal(state.cruiseQualified, true);
  assert.equal(state.phase, 'cruise');
  state = finishIslandHopRun(state, { completed: true });
  assert.deepEqual(islandHopRunPublicState(state), { available: true, active: false, phase: 'arrive', completed: true });
});

test('interruptions reset an incomplete run and malformed telemetry fails closed', () => {
  for (const patch of [
    { paused: true },
    { recoveryActive: true },
    { restorePublishing: true },
    { crossingActive: true },
    { position: { x: NaN, y: 0, z: 0 } },
  ]) {
    let state = startIslandHopRun(createIslandHopRunState(), { completed: true }, pos(0));
    state = stepIslandHopRun({ state, frame: frame(pos(40)) });
    state = stepIslandHopRun({ state, frame: frame(pos(80), patch) });
    assert.deepEqual(islandHopRunPublicState(state), { available: false, active: false, phase: null, completed: false });
  }
});

test('duplicate completion is latched and public state stays bounded', () => {
  let state = startIslandHopRun(createIslandHopRunState(), { completed: true }, pos(0));
  for (const x of [40, 80, 120, 160, 205]) state = stepIslandHopRun({ state, frame: frame(pos(x)) });
  state = finishIslandHopRun(state, { completed: true, secret: 'nope' });
  const latched = finishIslandHopRun(state, { completed: true });
  assert.equal(latched, state);
  assert.deepEqual(Object.keys(islandHopRunPublicState({ ...state, secret: 'hidden' })), ['available', 'active', 'phase', 'completed']);
});
