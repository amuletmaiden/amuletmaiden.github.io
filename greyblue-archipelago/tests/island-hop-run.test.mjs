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
const landfall = (islandId) => ({ completed: true, islandId });
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

function cruise(state, start = 0) {
  for (const x of [40, 80, 120, 160, 205]) {
    state = stepIslandHopRun({ state, frame: frame(pos(start + x)) });
  }
  return state;
}

test('starts only from truthful finite named landfall evidence', () => {
  const initial = createIslandHopRunState();
  assert.equal(startIslandHopRun(initial, { completed: false, islandId: 'a' }, pos(0)), initial);
  assert.equal(startIslandHopRun(initial, { completed: true }, pos(0)), initial);
  assert.equal(startIslandHopRun(initial, landfall('a'), { x: NaN, y: 0, z: 0 }), initial);
  const started = startIslandHopRun(initial, landfall('a'), pos(0));
  assert.deepEqual(islandHopRunPublicState(started), { active: true, phase: 'depart', completed: false });
  assert.deepEqual(started.visitedIslandIds, ['a']);
});

test('requires three distinct truthful landfalls with meaningful airborne travel between them', () => {
  let state = startIslandHopRun(createIslandHopRunState(), landfall('a'), pos(0));
  state = cruise(state, 0);
  assert.equal(state.cruiseQualified, true);
  state = finishIslandHopRun(state, landfall('b'), pos(205));
  assert.deepEqual(state.visitedIslandIds, ['a', 'b']);
  assert.deepEqual(islandHopRunPublicState(state), { active: true, phase: 'depart', completed: false });

  state = cruise(state, 205);
  state = finishIslandHopRun(state, landfall('c'), pos(410));
  assert.deepEqual(state.visitedIslandIds, ['a', 'b', 'c']);
  assert.deepEqual(islandHopRunPublicState(state), { active: false, phase: 'arrive', completed: true });
});

test('same-island relands and revisiting an earlier island do not advance', () => {
  let state = startIslandHopRun(createIslandHopRunState(), landfall('a'), pos(0));
  state = cruise(state, 0);
  const same = finishIslandHopRun(state, landfall('a'), pos(205));
  assert.equal(same, state);

  state = finishIslandHopRun(state, landfall('b'), pos(205));
  state = cruise(state, 205);
  const revisit = finishIslandHopRun(state, landfall('a'), pos(410));
  assert.equal(revisit, state);
  assert.deepEqual(state.visitedIslandIds, ['a', 'b']);
});

test('hover and jitter do not qualify cruise travel', () => {
  let state = startIslandHopRun(createIslandHopRunState(), landfall('a'), pos(0));
  for (const x of [2, 4, 6, 8, 10, 12]) state = stepIslandHopRun({ state, frame: frame(pos(x)) });
  assert.equal(state.travel, 0);
  assert.equal(state.cruiseQualified, false);
  assert.equal(finishIslandHopRun(state, landfall('b'), pos(12)), state);
});

test('teleport-like motion, impact, recovery, interruption, grounding, and malformed telemetry reset', () => {
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
    let state = startIslandHopRun(createIslandHopRunState(), landfall('a'), pos(0));
    state = stepIslandHopRun({ state, frame: frame(pos(40)) });
    state = stepIslandHopRun({ state, frame: frame(pos(80), patch) });
    assert.deepEqual(islandHopRunPublicState(state), { active: false, phase: null, completed: false });
  }
});

test('completion is one-shot and public state hides island identity', () => {
  let state = startIslandHopRun(createIslandHopRunState(), landfall('a'), pos(0));
  state = finishIslandHopRun(cruise(state, 0), landfall('b'), pos(205));
  state = finishIslandHopRun(cruise(state, 205), landfall('c'), pos(410));
  const latched = finishIslandHopRun(state, landfall('d'), pos(410));
  assert.equal(latched, state);
  assert.deepEqual(Object.keys(islandHopRunPublicState({ ...state, secret: 'hidden' })), ['active', 'phase', 'completed']);
});
