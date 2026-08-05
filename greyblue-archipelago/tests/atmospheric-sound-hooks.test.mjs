import assert from 'node:assert/strict';
import test from 'node:test';

import { planAtmosphericSoundHooks } from '../src/content/atmospheric-sound-hooks.js';

const candidates = [
  { hookId: 'wind-high-passage', priority: 4, durationMs: 2400, gain: 0.8 },
  { hookId: 'stone-chime', priority: 8, durationMs: 1800, gain: 0.6, spatial: false },
];

test('selects the highest-priority eligible hook deterministically', () => {
  const result = planAtmosphericSoundHooks({
    nowMs: 2000,
    candidates,
    soundEnabled: true,
  });
  assert.equal(result.cue.hookId, 'stone-chime');
  assert.equal(result.telemetry.reason, 'emitted');
  assert.deepEqual(result.state.recentHookIds, ['stone-chime']);
});

test('suppresses emission while cooldown is active', () => {
  const result = planAtmosphericSoundHooks(
    { nowMs: 2200, candidates },
    { lastEmitMs: 1800, recentHookIds: ['stone-chime'] },
  );
  assert.equal(result.cue, null);
  assert.equal(result.telemetry.reason, 'cooldown');
});

test('sound-off removes hooks without removing semantic state', () => {
  const previous = { lastEmitMs: 1000, recentHookIds: ['wind-high-passage'] };
  const result = planAtmosphericSoundHooks({ nowMs: 5000, candidates, soundEnabled: false }, previous);
  assert.equal(result.cue, null);
  assert.equal(result.telemetry.reason, 'sound-disabled');
  assert.deepEqual(result.state.recentHookIds, ['wind-high-passage']);
});

test('performance pressure scales optional gain before suppressing traversal systems', () => {
  const degraded = planAtmosphericSoundHooks({
    nowMs: 5000,
    candidates,
    performanceMode: 'degraded',
  });
  const critical = planAtmosphericSoundHooks({
    nowMs: 5000,
    candidates,
    performanceMode: 'critical',
  });
  assert.equal(degraded.cue.gain, 0.36);
  assert.equal(critical.cue.gain, 0.18);
  assert.equal(degraded.telemetry.densityScale, 0.6);
  assert.equal(critical.telemetry.densityScale, 0.3);
});

test('reduced-motion keeps the same semantic cue with a bounded duration', () => {
  const normal = planAtmosphericSoundHooks({ nowMs: 5000, candidates });
  const reduced = planAtmosphericSoundHooks({ nowMs: 5000, candidates, reducedMotion: true });
  assert.equal(reduced.cue.hookId, normal.cue.hookId);
  assert.equal(reduced.cue.durationMs, 1350);
});

test('recent-history suppression rotates optional atmosphere', () => {
  const result = planAtmosphericSoundHooks(
    { nowMs: 5000, candidates },
    { lastEmitMs: 0, recentHookIds: ['stone-chime'] },
  );
  assert.equal(result.cue.hookId, 'wind-high-passage');
});

test('malformed input remains finite, immutable, and JSON-safe', () => {
  const input = {
    nowMs: Number.NaN,
    candidates: [null, { hookId: '', priority: Infinity, durationMs: -4, gain: 9 }],
  };
  const before = structuredClone(input);
  const result = planAtmosphericSoundHooks(input, { lastEmitMs: Number.NaN, recentHookIds: [null] });
  assert.deepEqual(input, before);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(Number.isFinite(result.state.lastEmitMs));
  if (result.cue) {
    assert.ok(Number.isFinite(result.cue.durationMs));
    assert.ok(Number.isFinite(result.cue.gain));
  }
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.state));
  assert.ok(Object.isFrozen(result.telemetry));
});
