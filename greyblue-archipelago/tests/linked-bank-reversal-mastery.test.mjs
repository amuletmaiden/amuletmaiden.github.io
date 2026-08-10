import assert from 'node:assert/strict';
import {
  createLinkedBankReversalState,
  stepLinkedBankReversal,
  linkedBankReversalPublicState,
} from '../src/core/linked-bank-reversal-mastery.js';

const baseFrame = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  speed: 44,
  position: Object.freeze({ x: 0, y: 140, z: 0 }),
});

function frameAt(x, patch = {}) {
  return { ...baseFrame, ...patch, position: { x, y: 140, z: 0 } };
}

function step(state, x, side = null, patch = {}) {
  return stepLinkedBankReversal({
    state,
    frame: frameAt(x, patch),
    bankArc: side ? { active: true, turnClass: side } : { active: false, turnClass: null },
  });
}

{
  let state = createLinkedBankReversalState();
  state = step(state, 0, 'left');
  state = step(state, 14, 'left');
  assert.equal(state.phase, 'first');
  state = step(state, 22, null);
  assert.equal(state.phase, 'cross');
  state = step(state, 28, null);
  assert.equal(state.crossEstablished, true);
  state = step(state, 32, 'right');
  assert.equal(state.phase, 'reverse');
  state = step(state, 44, 'right');
  assert.equal(state.completed, true);
}

{
  let state = createLinkedBankReversalState();
  state = step(state, 0, 'right');
  state = step(state, 15, 'right');
  state = step(state, 23, null);
  state = step(state, 29, null);
  state = step(state, 33, 'left');
  state = step(state, 45, 'left');
  assert.equal(state.completed, true, 'right-to-left ordering has identical semantics');
}

{
  let state = createLinkedBankReversalState();
  state = step(state, 0, 'left');
  state = step(state, 2, 'left');
  state = step(state, 3, null);
  assert.equal(state.phase, 'idle', 'first carve requires meaningful travel');
}

{
  let state = createLinkedBankReversalState();
  state = step(state, 0, 'left');
  state = step(state, 14, 'left');
  state = step(state, 15, 'right');
  assert.equal(state.phase, 'idle', 'opposite-side flicker cannot bypass the neutral cross');
}

{
  let state = createLinkedBankReversalState();
  state = step(state, 0, 'left');
  state = step(state, 14, 'left');
  state = step(state, 22, null);
  state = step(state, 28, null);
  state = step(state, 32, 'left');
  assert.equal(state.phase, 'idle', 'same-side carve after an established cross is not a reversal');
}

for (const patch of [
  { ready: false },
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { restorePublishing: true },
  { speed: 12 },
  { position: { x: Number.NaN, y: 0, z: 0 } },
]) {
  const frame = patch.position ? { ...baseFrame, ...patch } : frameAt(0, patch);
  const state = stepLinkedBankReversal({
    state: createLinkedBankReversalState(),
    frame,
    bankArc: { active: true, turnClass: 'left' },
  });
  assert.equal(state.phase, 'idle');
  assert.equal(state.completed, false);
}

{
  const caller = {
    state: createLinkedBankReversalState(),
    frame: frameAt(0),
    bankArc: { active: true, turnClass: 'left' },
  };
  const before = JSON.stringify(caller);
  stepLinkedBankReversal(caller);
  assert.equal(JSON.stringify(caller), before, 'caller inputs remain immutable');
}

{
  const state = step(createLinkedBankReversalState(), 0, 'left');
  const publicState = linkedBankReversalPublicState(state, frameAt(0));
  assert.deepEqual(Object.keys(publicState), ['available', 'active', 'phase', 'completed', 'direction']);
  assert.deepEqual(publicState, {
    available: true,
    active: true,
    phase: 'first',
    completed: false,
    direction: 'left-right',
  });
}

console.log('linked bank reversal mastery regression source loaded');
