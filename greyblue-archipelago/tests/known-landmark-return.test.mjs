import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginKnownLandmarkReturn,
  createKnownLandmarkReturnState,
  knownLandmarkReturnMessage,
  knownLandmarkReturnPublicState,
  registerKnownLandmarkReturn,
  stepKnownLandmarkReturn,
} from '../src/core/known-landmark-return.js';

const pos = (x, y = 55, z = 0) => ({ x, y, z });
const landmark = (landmarkId, patch = {}) => ({
  eligible: true,
  discovered: true,
  investigated: true,
  landmarkId,
  ...patch,
});
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

function depart(state, start = 0) {
  for (const x of [30, 60, 90, 125]) state = stepKnownLandmarkReturn({ state, frame: frame(pos(start + x)) });
  return state;
}

test('begins only from discovered investigated eligible landmark truth', () => {
  const initial = createKnownLandmarkReturnState();
  assert.equal(beginKnownLandmarkReturn(initial, landmark('l', { discovered: false }), pos(0)), initial);
  assert.equal(beginKnownLandmarkReturn(initial, landmark('l', { investigated: false }), pos(0)), initial);
  assert.equal(beginKnownLandmarkReturn(initial, landmark('l', { eligible: false }), pos(0)), initial);
  assert.equal(beginKnownLandmarkReturn(initial, landmark(''), pos(0)), initial);
  const started = beginKnownLandmarkReturn(initial, landmark('l'), pos(0));
  assert.deepEqual(knownLandmarkReturnPublicState(started), { active: true, phase: 'depart', completed: false });
});

test('recognizes a meaningful airborne departure followed by return to the same landmark', () => {
  let state = beginKnownLandmarkReturn(createKnownLandmarkReturnState(), landmark('l'), pos(0));
  state = depart(state);
  assert.deepEqual(knownLandmarkReturnPublicState(state), { active: true, phase: 'return', completed: false });
  state = registerKnownLandmarkReturn(state, landmark('l'));
  assert.deepEqual(knownLandmarkReturnPublicState(state), { active: false, phase: 'complete', completed: true });
  assert.equal(knownLandmarkReturnMessage(state), 'You find the landmark again from the air.');
});

test('jitter, early return, and a different landmark do not complete', () => {
  let state = beginKnownLandmarkReturn(createKnownLandmarkReturnState(), landmark('l'), pos(0));
  for (const x of [2, 4, 6, 8, 10]) state = stepKnownLandmarkReturn({ state, frame: frame(pos(x)) });
  assert.equal(registerKnownLandmarkReturn(state, landmark('l')), state);
  state = depart(state);
  assert.equal(registerKnownLandmarkReturn(state, landmark('other')), state);
});

test('teleport-like motion and canonical interruptions reset', () => {
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
    let state = beginKnownLandmarkReturn(createKnownLandmarkReturnState(), landmark('l'), pos(0));
    state = stepKnownLandmarkReturn({ state, frame: frame(pos(30)) });
    state = stepKnownLandmarkReturn({ state, frame: frame(pos(60), patch) });
    assert.deepEqual(knownLandmarkReturnPublicState(state), { active: false, phase: null, completed: false });
  }
});

test('public state and message do not expose landmark identity', () => {
  let state = beginKnownLandmarkReturn(createKnownLandmarkReturnState(), landmark('secret-landmark'), pos(0));
  state = registerKnownLandmarkReturn(depart(state), landmark('secret-landmark'));
  const publicState = knownLandmarkReturnPublicState({ ...state, hidden: 'secret' });
  assert.deepEqual(Object.keys(publicState), ['active', 'phase', 'completed']);
  assert.equal(JSON.stringify(publicState).includes('secret-landmark'), false);
  assert.equal(knownLandmarkReturnMessage(state).includes('secret-landmark'), false);
});
