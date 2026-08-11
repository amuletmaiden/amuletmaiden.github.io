import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTouchdownContactFeedbackState,
  publicTouchdownContactFeedback,
  stepTouchdownContactFeedback,
} from '../src/core/touchdown-contact-feedback.js';

function baseFrame(overrides = {}) {
  return {
    ready: true,
    paused: false,
    restorePublishing: false,
    recovery: false,
    airborne: false,
    grounded: true,
    collisionReason: 'touchdown',
    speed: 8,
    ...overrides,
  };
}

test('soft touchdown emits once and repeated grounded publication is suppressed', () => {
  const initial = createTouchdownContactFeedbackState();
  const first = stepTouchdownContactFeedback(initial, baseFrame());
  assert.deepEqual(publicTouchdownContactFeedback(first), { active: true, kind: 'soft' });
  const repeated = stepTouchdownContactFeedback(first, baseFrame());
  assert.deepEqual(publicTouchdownContactFeedback(repeated), { active: false, kind: 'none' });
});

test('faster touchdown is firm while impact reasons remain distinct', () => {
  const firm = stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), baseFrame({ speed: 18 }));
  assert.deepEqual(publicTouchdownContactFeedback(firm), { active: true, kind: 'firm' });
  const impact = stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), baseFrame({ grounded: false, airborne: true, collisionReason: 'terrain-impact', speed: 30 }));
  assert.deepEqual(publicTouchdownContactFeedback(impact), { active: true, kind: 'impact' });
});

test('airborne clear flight rearms contact feedback', () => {
  const landed = stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), baseFrame());
  const clear = stepTouchdownContactFeedback(landed, baseFrame({ airborne: true, grounded: false, collisionReason: 'clear' }));
  const landedAgain = stepTouchdownContactFeedback(clear, baseFrame());
  assert.deepEqual(publicTouchdownContactFeedback(landedAgain), { active: true, kind: 'soft' });
});

test('recovery, pause and restore fail closed', () => {
  for (const overrides of [{ recovery: true }, { paused: true }, { restorePublishing: true }, { ready: false }]) {
    const next = stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), baseFrame(overrides));
    assert.deepEqual(publicTouchdownContactFeedback(next), { active: false, kind: 'none' });
  }
});

test('water and settled-ground reasons do not manufacture touchdown feedback', () => {
  for (const collisionReason of ['water-contact', 'grounded-contact']) {
    const next = stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), baseFrame({ collisionReason }));
    assert.deepEqual(publicTouchdownContactFeedback(next), { active: false, kind: 'none' });
  }
});

test('public projection strips latch and malformed state', () => {
  assert.deepEqual(publicTouchdownContactFeedback({ active: true, kind: 'soft', contactLatched: true, speed: 99 }), { active: true, kind: 'soft' });
  assert.deepEqual(publicTouchdownContactFeedback({ active: true, kind: 'mystery', contactLatched: true }), { active: false, kind: 'none' });
});

test('caller frame is not mutated', () => {
  const frame = baseFrame();
  const before = structuredClone(frame);
  stepTouchdownContactFeedback(createTouchdownContactFeedbackState(), frame);
  assert.deepEqual(frame, before);
});
