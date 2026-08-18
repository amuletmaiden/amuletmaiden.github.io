import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginLandmarkOrbitRun,
  createLandmarkOrbitRunState,
  landmarkOrbitRunMessage,
  landmarkOrbitRunPublicState,
  stepLandmarkOrbitRun,
} from '../src/core/landmark-orbit-run.js';

const center = { x: 0, y: 55, z: 0 };
const pos = (angle, radius = 72, y = 55) => ({
  x: Math.cos(angle) * radius,
  y,
  z: Math.sin(angle) * radius,
});
const landmark = (patch = {}) => ({
  eligible: true,
  discovered: true,
  investigated: true,
  landmarkId: 'known-landmark',
  position: center,
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

function circle(state) {
  for (let angle = 0.24; angle <= 5.4; angle += 0.24) {
    state = stepLandmarkOrbitRun({ state, frame: frame(pos(angle)) });
  }
  return state;
}

test('begins only around an eligible discovered investigated landmark', () => {
  const initial = createLandmarkOrbitRunState();
  assert.equal(beginLandmarkOrbitRun(initial, landmark({ discovered: false }), pos(0)), initial);
  assert.equal(beginLandmarkOrbitRun(initial, landmark({ investigated: false }), pos(0)), initial);
  assert.equal(beginLandmarkOrbitRun(initial, landmark({ eligible: false }), pos(0)), initial);
  assert.equal(beginLandmarkOrbitRun(initial, landmark({ landmarkId: '' }), pos(0)), initial);
  assert.equal(beginLandmarkOrbitRun(initial, landmark(), pos(0, 10)), initial);
  const started = beginLandmarkOrbitRun(initial, landmark(), pos(0));
  assert.deepEqual(landmarkOrbitRunPublicState(started), { active: true, phase: 'circle', completed: false });
});

test('recognizes a sustained one-direction orbit and emits one identity-free completion line', () => {
  let state = beginLandmarkOrbitRun(createLandmarkOrbitRunState(), landmark(), pos(0));
  state = circle(state);
  assert.deepEqual(landmarkOrbitRunPublicState(state), { active: false, phase: 'complete', completed: true });
  assert.equal(landmarkOrbitRunMessage(state), 'You circle the landmark and see it whole.');
  assert.equal(landmarkOrbitRunMessage(state).includes('known-landmark'), false);
  const after = stepLandmarkOrbitRun({ state, frame: frame(pos(5.8)) });
  assert.equal(after, state);
});

test('jitter does not accumulate and reversing direction resets', () => {
  let state = beginLandmarkOrbitRun(createLandmarkOrbitRunState(), landmark(), pos(0));
  for (const angle of [0.01, 0.02, 0.03, 0.04, 0.05]) {
    state = stepLandmarkOrbitRun({ state, frame: frame(pos(angle)) });
  }
  assert.deepEqual(landmarkOrbitRunPublicState(state), { active: true, phase: 'circle', completed: false });
  state = stepLandmarkOrbitRun({ state, frame: frame(pos(0.3)) });
  state = stepLandmarkOrbitRun({ state, frame: frame(pos(0.05)) });
  assert.deepEqual(landmarkOrbitRunPublicState(state), { active: false, phase: null, completed: false });
});

test('teleport-like angular jumps, bad radius, and canonical interruptions reset', () => {
  const cases = [
    frame(pos(2.5)),
    frame(pos(0.3, 10)),
    frame(pos(0.3, 240)),
    frame(pos(0.3), { impact: true }),
    frame(pos(0.3), { recoveryActive: true }),
    frame(pos(0.3), { paused: true }),
    frame(pos(0.3), { crossingActive: true }),
    frame(pos(0.3), { grounded: true, airborne: false }),
    frame({ x: NaN, y: 0, z: 0 }),
  ];
  for (const badFrame of cases) {
    let state = beginLandmarkOrbitRun(createLandmarkOrbitRunState(), landmark(), pos(0));
    state = stepLandmarkOrbitRun({ state, frame: badFrame });
    assert.deepEqual(landmarkOrbitRunPublicState(state), { active: false, phase: null, completed: false });
  }
});

test('public projection and caller landmark data stay bounded and immutable', () => {
  const detail = landmark({ hiddenRegion: 'secret-region' });
  const snapshot = structuredClone(detail);
  let state = beginLandmarkOrbitRun(createLandmarkOrbitRunState(), detail, pos(0));
  state = circle(state);
  assert.deepEqual(detail, snapshot);
  const publicState = landmarkOrbitRunPublicState({ ...state, landmarkId: 'secret-landmark', hidden: 'secret' });
  assert.deepEqual(Object.keys(publicState), ['active', 'phase', 'completed']);
  assert.equal(JSON.stringify(publicState).includes('secret'), false);
});
