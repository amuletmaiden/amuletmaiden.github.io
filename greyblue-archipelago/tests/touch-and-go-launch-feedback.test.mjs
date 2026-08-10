import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTouchAndGoFeedback,
  consumeTouchAndGoCompletion,
  createTouchAndGoFeedbackState,
  touchAndGoFeedbackPublicState,
} from '../src/core/touch-and-go-launch-feedback.js';

test('feedback activates only from truthful completion', () => {
  const initial = createTouchAndGoFeedbackState();
  assert.equal(consumeTouchAndGoCompletion(initial, null), initial);
  assert.equal(consumeTouchAndGoCompletion(initial, { completed: false }), initial);
  const active = consumeTouchAndGoCompletion(initial, { completed: true });
  assert.deepEqual(touchAndGoFeedbackPublicState(active), { active: true, responseClass: 'lifted' });
});

test('duplicate completion cannot replay consumed feedback', () => {
  const active = consumeTouchAndGoCompletion(createTouchAndGoFeedbackState(), { completed: true });
  const duplicate = consumeTouchAndGoCompletion(active, { completed: true });
  assert.equal(duplicate, active);
});

test('cleanup clears presentation but preserves one-shot consumption', () => {
  const active = consumeTouchAndGoCompletion(createTouchAndGoFeedbackState(), { completed: true });
  const cleared = clearTouchAndGoFeedback(active);
  assert.deepEqual(touchAndGoFeedbackPublicState(cleared), { active: false, responseClass: null });
  assert.equal(cleared.consumed, true);
  assert.equal(consumeTouchAndGoCompletion(cleared, { completed: true }), cleared);
});

test('public feedback state is bounded and input is not mutated', () => {
  const detail = { completed: true, secret: 'stay-private' };
  const active = consumeTouchAndGoCompletion(createTouchAndGoFeedbackState(), detail);
  assert.equal(detail.secret, 'stay-private');
  assert.deepEqual(Object.keys(touchAndGoFeedbackPublicState({ ...active, hidden: 42 })), ['active', 'responseClass']);
});
