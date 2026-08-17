import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archipelagoFlybyRunPublicState,
  beginArchipelagoFlybyRun,
  createArchipelagoFlybyRunState,
  registerArchipelagoFlyby,
  stepArchipelagoFlybyRun,
} from '../src/core/archipelago-flyby-run.js';

const pos = (x, y = 55, z = 0) => ({ x, y, z });
const flyby = (islandId, patch = {}) => ({ eligible: true, discovered: true, islandId, ...patch });
const frame = (position, patch = {}) => ({
  ready: true,
  paused: false,
  recoveryActive: false,
  restorePublishing: false,
  crossingActive: false,
  impact: false,
  grounded: false,
  airborne: true,
  position,
  ...patch,
});

function travel(state, start = 0) {
  for (const x of [35, 70, 105, 145]) state = stepArchipelagoFlybyRun({ state, frame: frame(pos(start + x)) });
  return state;
}

test('begins only from explicit discovered eligible flyby truth', () => {
  const initial = createArchipelagoFlybyRunState();
  assert.equal(beginArchipelagoFlybyRun(initial, flyby('a', { eligible: false }), pos(0)), initial);
  assert.equal(beginArchipelagoFlybyRun(initial, flyby('a', { discovered: false }), pos(0)), initial);
  assert.equal(beginArchipelagoFlybyRun(initial, flyby(''), pos(0)), initial);
  assert.equal(beginArchipelagoFlybyRun(initial, flyby('a'), { x: NaN, y: 0, z: 0 }), initial);
  const started = beginArchipelagoFlybyRun(initial, flyby('a'), pos(0));
  assert.deepEqual(archipelagoFlybyRunPublicState(started), { active: true, phase: 'range', completed: false });
});

test('recognizes three distinct discovered flybys separated by meaningful airborne travel', () => {
  let state = beginArchipelagoFlybyRun(createArchipelagoFlybyRunState(), flyby('a'), pos(0));
  state = registerArchipelagoFlyby(travel(state), flyby('b'), pos(145));
  assert.deepEqual(state.visitedIslandIds, ['a', 'b']);
  assert.deepEqual(archipelagoFlybyRunPublicState(state), { active: true, phase: 'range', completed: false });
  state = registerArchipelagoFlyby(travel(state, 145), flyby('c'), pos(290));
  assert.deepEqual(archipelagoFlybyRunPublicState(state), { active: false, phase: 'complete', completed: true });
});

test('jitter and repeated or undiscovered islands do not advance', () => {
  let state = beginArchipelagoFlybyRun(createArchipelagoFlybyRunState(), flyby('a'), pos(0));
  for (const x of [2, 4, 6, 8, 10]) state = stepArchipelagoFlybyRun({ state, frame: frame(pos(x)) });
  assert.equal(state.travelSinceFlyby, 0);
  assert.equal(registerArchipelagoFlyby(state, flyby('b'), pos(10)), state);
  state = travel(state);
  assert.equal(registerArchipelagoFlyby(state, flyby('a'), pos(145)), state);
  assert.equal(registerArchipelagoFlyby(state, flyby('b', { discovered: false }), pos(145)), state);
});

test('teleport-like motion and canonical interruptions reset the run', () => {
  const patches = [
    { position: pos(400) },
    { impact: true },
    { recoveryActive: true },
    { paused: true },
    { crossingActive: true },
    { grounded: true, airborne: false },
    { position: { x: NaN, y: 0, z: 0 } },
  ];
  for (const patch of patches) {
    let state = beginArchipelagoFlybyRun(createArchipelagoFlybyRunState(), flyby('a'), pos(0));
    state = stepArchipelagoFlybyRun({ state, frame: frame(pos(35)) });
    state = stepArchipelagoFlybyRun({ state, frame: frame(pos(70), patch) });
    assert.deepEqual(archipelagoFlybyRunPublicState(state), { active: false, phase: null, completed: false });
  }
});

test('public state is bounded and completion latches', () => {
  let state = beginArchipelagoFlybyRun(createArchipelagoFlybyRunState(), flyby('a'), pos(0));
  state = registerArchipelagoFlyby(travel(state), flyby('b'), pos(145));
  state = registerArchipelagoFlyby(travel(state, 145), flyby('c'), pos(290));
  const latched = registerArchipelagoFlyby(state, flyby('d'), pos(290));
  assert.equal(latched, state);
  assert.deepEqual(Object.keys(archipelagoFlybyRunPublicState({ ...state, hidden: 'secret' })), ['active', 'phase', 'completed']);
});
