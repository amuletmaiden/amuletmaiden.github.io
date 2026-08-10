import assert from 'node:assert/strict';
import {
  createDivePullClimbState,
  stepDivePullClimb,
  divePullClimbPublicState,
} from '../src/core/dive-pull-climb-mastery.js';

const baseFrame = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  speed: 46,
  altitude: 300,
  verticalSpeed: -14,
  airClass: 'dive',
});

function step(state, patch = {}) {
  return stepDivePullClimb({ state, frame: { ...baseFrame, ...patch } });
}

{
  let state = createDivePullClimbState();
  state = step(state);
  assert.equal(state.phase, 'dive');
  state = step(state, { altitude: 270 });
  assert.equal(state.diveEstablished, true);
  state = step(state, { altitude: 268, verticalSpeed: 0, airClass: 'bank' });
  assert.equal(state.phase, 'pull');
  state = step(state, { altitude: 270, verticalSpeed: 10, airClass: 'climb' });
  assert.equal(state.phase, 'climb');
  state = step(state, { altitude: 290, verticalSpeed: 11, airClass: 'climb' });
  assert.equal(state.completed, true);
  const publicState = divePullClimbPublicState(state, { ...baseFrame, altitude: 290, verticalSpeed: 11, airClass: 'climb' });
  assert.deepEqual(publicState, { available: false, active: false, phase: null, completed: true });
}

{
  let state = createDivePullClimbState();
  state = step(state);
  state = step(state, { altitude: 295, verticalSpeed: 0, airClass: 'bank' });
  assert.equal(state.phase, 'idle', 'one-frame/shallow dive cannot establish a maneuver');
}

{
  let state = createDivePullClimbState();
  state = step(state);
  state = step(state, { altitude: 276 });
  assert.equal(state.diveEstablished, true);
  state = step(state, { altitude: 276, verticalSpeed: 0, airClass: 'bank' });
  state = step(state, { altitude: 277, verticalSpeed: 9, airClass: 'climb' });
  state = step(state, { altitude: 282, verticalSpeed: 8, airClass: 'climb' });
  assert.equal(state.completed, false, 'climb must recover meaningful altitude');
}

{
  let state = createDivePullClimbState();
  state = step(state);
  state = step(state, { altitude: 270 });
  state = step(state, { altitude: 270, verticalSpeed: 0, airClass: 'bank' });
  state = step(state, { altitude: 272, verticalSpeed: 10, airClass: 'climb' });
  state = step(state, { altitude: 295, verticalSpeed: 10, airClass: 'climb' });
  assert.equal(state.completed, true);
  const repeated = step(state, { altitude: 330, verticalSpeed: 12, airClass: 'climb' });
  assert.equal(repeated.completed, true, 'completion remains duplicate-suppressed for the session');
  assert.equal(repeated.phase, 'idle');
}

for (const patch of [
  { ready: false },
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { restorePublishing: true },
  { speed: 12 },
  { altitude: Number.NaN },
  { verticalSpeed: Number.NaN },
]) {
  const state = step(createDivePullClimbState(), patch);
  assert.equal(state.phase, 'idle');
  assert.equal(state.completed, false);
}

{
  const caller = {
    state: createDivePullClimbState(),
    frame: { ...baseFrame },
  };
  const stateBefore = JSON.stringify(caller.state);
  const frameBefore = JSON.stringify(caller.frame);
  stepDivePullClimb(caller);
  assert.equal(JSON.stringify(caller.state), stateBefore);
  assert.equal(JSON.stringify(caller.frame), frameBefore);
}

{
  const state = step(createDivePullClimbState());
  const publicState = divePullClimbPublicState(state, baseFrame);
  assert.deepEqual(Object.keys(publicState), ['available', 'active', 'phase', 'completed']);
  assert.deepEqual(publicState, { available: true, active: true, phase: 'dive', completed: false });
}

console.log('dive-pull-climb mastery regression source loaded');
