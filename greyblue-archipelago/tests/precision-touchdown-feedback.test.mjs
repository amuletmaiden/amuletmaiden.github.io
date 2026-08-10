import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPrecisionTouchdownFeedback,
  consumePrecisionTouchdownCompletion,
  createPrecisionTouchdownFeedbackState,
  precisionTouchdownFeedbackPublicState,
} from '../src/core/precision-touchdown-feedback.js';

test('truthful completion arms one bounded response', () => {
  const initial = createPrecisionTouchdownFeedbackState();
  const next = consumePrecisionTouchdownCompletion(initial, { completed: true, soundHook: 'precision-touchdown' });
  assert.equal(next.consumed, true);
  assert.deepEqual(precisionTouchdownFeedbackPublicState(next), { active: true, responseClass: 'settled' });
  assert.equal(initial.consumed, false);
});

test('duplicate completion cannot retrigger the response', () => {
  const first = consumePrecisionTouchdownCompletion(createPrecisionTouchdownFeedbackState(), { completed: true });
  const cleared = clearPrecisionTouchdownFeedback(first);
  const duplicate = consumePrecisionTouchdownCompletion(cleared, { completed: true });
  assert.equal(duplicate, cleared);
  assert.deepEqual(precisionTouchdownFeedbackPublicState(duplicate), { active: false, responseClass: null });
});

test('malformed, incomplete, and mismatched completion events fail closed', () => {
  for (const detail of [
    null,
    {},
    { completed: false },
    { completed: true, soundHook: 'other-hook' },
    'completed',
  ]) {
    const initial = createPrecisionTouchdownFeedbackState();
    const next = consumePrecisionTouchdownCompletion(initial, detail);
    assert.equal(next, initial);
    assert.deepEqual(precisionTouchdownFeedbackPublicState(next), { active: false, responseClass: null });
  }
});

test('cleanup preserves duplicate suppression while removing active presentation', () => {
  const first = consumePrecisionTouchdownCompletion(createPrecisionTouchdownFeedbackState(), { completed: true });
  const cleared = clearPrecisionTouchdownFeedback(first);
  assert.deepEqual(cleared, { consumed: true, active: false, responseClass: null });
});

test('public state strips internal latch and arbitrary fields', () => {
  const view = precisionTouchdownFeedbackPublicState({ consumed: true, active: true, responseClass: 'settled', secret: 'nope' });
  assert.deepEqual(Object.keys(view), ['active', 'responseClass']);
  assert.equal('consumed' in view, false);
  assert.equal('secret' in view, false);
});
