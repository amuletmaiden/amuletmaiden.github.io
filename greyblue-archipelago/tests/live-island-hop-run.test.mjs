import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveIslandHopRun } from '../src/core/live-island-hop-run.js';

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

function cruise(run, start = 0) {
  let result;
  for (const x of [40, 80, 120, 160, 205]) result = run.update({ frame: frame(pos(start + x)) });
  return result;
}

test('composes three truthful landfalls and emits completion once', () => {
  const run = createLiveIslandHopRun();
  let result = run.update({ frame: frame(pos(0), { grounded: true, airborne: false }), landfall: landfall('a') });
  assert.deepEqual(result, { active: true, phase: 'depart', completed: false, completionMessage: null });

  cruise(run, 0);
  result = run.update({ frame: frame(pos(205), { grounded: true, airborne: false }), landfall: landfall('b') });
  assert.deepEqual(result, { active: true, phase: 'depart', completed: false, completionMessage: null });

  cruise(run, 205);
  result = run.update({ frame: frame(pos(410), { grounded: true, airborne: false }), landfall: landfall('c') });
  assert.deepEqual(result, { active: false, phase: 'arrive', completed: true, completionMessage: 'Three islands in one flight.' });

  result = run.update({ frame: frame(pos(410)) });
  assert.deepEqual(result, { active: false, phase: 'arrive', completed: true, completionMessage: null });
});

test('ordinary grounded or interrupted frames reset an active run', () => {
  const patches = [
    { grounded: true, airborne: false },
    { impact: true },
    { recoveryActive: true },
    { paused: true },
    { crossingActive: true },
    { position: { x: NaN, y: 0, z: 0 } },
  ];

  for (const patch of patches) {
    const run = createLiveIslandHopRun();
    run.update({ frame: frame(pos(0), { grounded: true, airborne: false }), landfall: landfall('a') });
    const result = run.update({ frame: frame(pos(40), patch) });
    assert.deepEqual(result, { active: false, phase: null, completed: false, completionMessage: null });
  }
});

test('same-island relands and premature landfalls cannot advance', () => {
  const run = createLiveIslandHopRun();
  run.update({ frame: frame(pos(0), { grounded: true, airborne: false }), landfall: landfall('a') });

  let result = run.update({ frame: frame(pos(10), { grounded: true, airborne: false }), landfall: landfall('a') });
  assert.deepEqual(result, { active: true, phase: 'depart', completed: false, completionMessage: null });

  result = run.update({ frame: frame(pos(12), { grounded: true, airborne: false }), landfall: landfall('b') });
  assert.deepEqual(result, { active: true, phase: 'depart', completed: false, completionMessage: null });
});

test('public results remain bounded and hide island identity', () => {
  const run = createLiveIslandHopRun();
  const result = run.update({ frame: frame(pos(0), { grounded: true, airborne: false }), landfall: landfall('secret-island') });
  assert.deepEqual(Object.keys(result), ['active', 'phase', 'completed', 'completionMessage']);
  assert.equal(JSON.stringify(result).includes('secret-island'), false);
});

test('reset explicitly rearms the adapter after a completed run', () => {
  const run = createLiveIslandHopRun();
  run.update({ frame: frame(pos(0), { grounded: true, airborne: false }), landfall: landfall('a') });
  cruise(run, 0);
  run.update({ frame: frame(pos(205), { grounded: true, airborne: false }), landfall: landfall('b') });
  cruise(run, 205);
  run.update({ frame: frame(pos(410), { grounded: true, airborne: false }), landfall: landfall('c') });

  assert.deepEqual(run.reset(), { active: false, phase: null, completed: false });
  const restarted = run.update({ frame: frame(pos(500), { grounded: true, airborne: false }), landfall: landfall('d') });
  assert.equal(restarted.active, true);
  assert.equal(restarted.phase, 'depart');
});
