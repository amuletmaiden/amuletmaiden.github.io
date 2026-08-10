import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearIslandHopFeedback,
  consumeIslandHopCompletion,
  createIslandHopFeedbackState,
  islandHopFeedbackPublicState,
} from '../src/core/island-hop-run-feedback.js';

test('consumes only truthful completed arrival', () => {
  const initial = createIslandHopFeedbackState();
  assert.equal(consumeIslandHopCompletion(initial, { completed: false, phase: 'arrive' }), initial);
  assert.equal(consumeIslandHopCompletion(initial, { completed: true, phase: 'cruise' }), initial);
  const consumed = consumeIslandHopCompletion(initial, { completed: true, phase: 'arrive' });
  assert.deepEqual(islandHopFeedbackPublicState(consumed), { active: true, responseClass: 'arrived' });
});

test('completion is one-shot even after presentation cleanup', () => {
  const initial = createIslandHopFeedbackState();
  const consumed = consumeIslandHopCompletion(initial, { completed: true, phase: 'arrive' });
  const cleared = clearIslandHopFeedback(consumed);
  assert.deepEqual(islandHopFeedbackPublicState(cleared), { active: false, responseClass: null });
  assert.equal(cleared.consumed, true);
  assert.equal(consumeIslandHopCompletion(cleared, { completed: true, phase: 'arrive' }), cleared);
});

test('public state remains bounded and caller state is not mutated', () => {
  const source = { active: true, consumed: true, responseClass: 'arrived', secret: 'hidden' };
  const before = structuredClone(source);
  const publicState = islandHopFeedbackPublicState(source);
  assert.deepEqual(source, before);
  assert.deepEqual(publicState, { active: true, responseClass: 'arrived' });
  assert.deepEqual(Object.keys(publicState), ['active', 'responseClass']);
});
