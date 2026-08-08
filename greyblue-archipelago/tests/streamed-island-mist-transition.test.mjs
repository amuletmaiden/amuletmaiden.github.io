import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStreamedIslandTransition,
  resetStreamedIslandTransition,
  streamedIslandMistOpacity,
} from '../src/core/streamed-island-mist-transition.js';

test('reveal remains bounded and increases with activation age', () => {
  const early = streamedIslandMistOpacity({ ageMs: 90, distance: 500, fogDensity: 0.00042 });
  const late = streamedIslandMistOpacity({ ageMs: 900, distance: 500, fogDensity: 0.00042 });
  assert.ok(early.opacity >= 0 && early.opacity <= 1);
  assert.ok(late.opacity >= early.opacity && late.opacity <= 1);
  assert.equal(early.transitioning, true);
  assert.equal(late.transitioning, false);
});

test('denser fog never weakens concealment handoff at equal age and distance', () => {
  const thin = streamedIslandMistOpacity({ ageMs: 450, distance: 200, fogDensity: 0.0001 });
  const dense = streamedIslandMistOpacity({ ageMs: 450, distance: 200, fogDensity: 0.004 });
  assert.ok(dense.opacity >= thin.opacity);
});

test('distance gate is deterministic and bounded', () => {
  const near = streamedIslandMistOpacity({ ageMs: 900, distance: 180, fogDensity: 0 });
  const far = streamedIslandMistOpacity({ ageMs: 900, distance: 600, fogDensity: 0 });
  assert.ok(far.opacity >= near.opacity);
  assert.ok(far.opacity <= 1);
});

test('reduced motion resolves immediately without transition animation', () => {
  const result = streamedIslandMistOpacity({ ageMs: 0, distance: 600, fogDensity: 0, reducedMotion: true });
  assert.equal(result.transitioning, false);
  assert.ok(result.opacity >= 0 && result.opacity <= 1);
});

test('malformed telemetry fails closed to finite bounded output', () => {
  const result = streamedIslandMistOpacity({ ageMs: NaN, distance: Infinity, fogDensity: -Infinity, revealMs: 'bad' });
  assert.ok(Number.isFinite(result.opacity));
  assert.ok(result.opacity >= 0 && result.opacity <= 1);
});

test('reset and clear remove prior pooled-resource reveal state', () => {
  const mesh = { userData: { stale: true }, material: { opacity: 0.72, transparent: true } };
  assert.equal(resetStreamedIslandTransition(mesh, 125), true);
  assert.equal(mesh.userData.streamTransition.activatedAtMs, 125);
  assert.equal(mesh.material.opacity, 0);
  assert.equal(mesh.material.transparent, true);
  assert.equal(clearStreamedIslandTransition(mesh), true);
  assert.equal('streamTransition' in mesh.userData, false);
  assert.equal(mesh.material.opacity, 1);
  assert.equal(mesh.material.transparent, false);
});
