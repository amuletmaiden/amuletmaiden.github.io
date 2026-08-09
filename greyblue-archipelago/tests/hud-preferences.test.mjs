import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controlHintForSource,
  deriveHudPreferenceState,
  normalizeHudDensity,
  normalizeHudInputSource,
  toggleHudDensity,
} from '../src/interface/hud-preferences.js';

test('HUD density defaults focused and accepts only bounded values', () => {
  assert.equal(normalizeHudDensity('expanded'), 'expanded');
  assert.equal(normalizeHudDensity('focused'), 'focused');
  assert.equal(normalizeHudDensity('secret-route'), 'focused');
  assert.equal(normalizeHudDensity(null), 'focused');
});

test('density toggle is deterministic', () => {
  assert.equal(toggleHudDensity('focused'), 'expanded');
  assert.equal(toggleHudDensity('expanded'), 'focused');
  assert.equal(toggleHudDensity('malformed'), 'expanded');
});

test('input source is coarse and fail-soft', () => {
  assert.equal(normalizeHudInputSource('gamepad'), 'gamepad');
  assert.equal(normalizeHudInputSource('keyboard'), 'keyboard');
  assert.equal(normalizeHudInputSource('DualSense Wireless Controller'), 'keyboard');
});

test('public preference state contains no caller settings or device detail', () => {
  const settings = { hudDensity: 'expanded', hiddenRoute: 'isle-secret' };
  const result = deriveHudPreferenceState({ settings, inputSource: 'gamepad' });
  assert.deepEqual(result.telemetry, { density: 'expanded', inputSource: 'gamepad' });
  assert.equal('hiddenRoute' in result, false);
  assert.equal('hiddenRoute' in result.telemetry, false);
  assert.deepEqual(settings, { hudDensity: 'expanded', hiddenRoute: 'isle-secret' });
});

test('control hints change labels without exposing device identity', () => {
  assert.match(controlHintForSource('keyboard'), /press H/i);
  assert.doesNotMatch(controlHintForSource('gamepad'), /DualSense|Xbox|button array/i);
});
