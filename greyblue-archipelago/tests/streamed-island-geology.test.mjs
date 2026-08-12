import assert from 'node:assert/strict';
import test from 'node:test';
import { profileStreamedIslandVertices, streamedIslandGeologyInternals } from '../src/core/streamed-island-geology.js';

const base = new Float32Array([
  100, -0.42, 0,
  50, 0.08, 86.60254,
  -50, 0.08, 86.60254,
  -100, 0.08, 0,
  -50, 0.58, -86.60254,
  50, 0.58, -86.60254,
  0, 0.58, 0,
]);

function radii(values) {
  const result = [];
  for (let index = 0; index < values.length; index += 3) result.push(Math.hypot(values[index], values[index + 2]));
  return result;
}

test('the same island always receives the same profile', () => {
  const first = profileStreamedIslandVertices(base, { id: 'isle-12', landmark: false });
  const second = profileStreamedIslandVertices(base, { id: 'isle-12', landmark: false });
  assert.deepEqual([...first], [...second]);
});

test('different island identities produce distinct silhouettes', () => {
  const first = profileStreamedIslandVertices(base, { id: 'isle-12', landmark: false });
  const second = profileStreamedIslandVertices(base, { id: 'isle-13', landmark: false });
  assert.notDeepEqual([...first], [...second]);
});

test('profiles stay within the original horizontal and vertical envelope', () => {
  const profiled = profileStreamedIslandVertices(base, { id: 'isle-31', landmark: true });
  const baseRadii = radii(base);
  const profiledRadii = radii(profiled);
  for (let index = 0; index < baseRadii.length; index += 1) {
    assert.equal(profiledRadii[index] <= baseRadii[index] + 1e-5, true);
    if (baseRadii[index] > 1e-7) {
      assert.equal(profiledRadii[index] >= baseRadii[index] * streamedIslandGeologyInternals.MIN_PROFILE_SCALE - 1e-5, true);
    }
  }
  for (let index = 1; index < base.length; index += 3) assert.equal(profiled[index], base[index]);
});

test('landmark geology remains deterministic but may carry extra crag character', () => {
  const ordinary = profileStreamedIslandVertices(base, { id: 'isle-7', landmark: false });
  const landmark = profileStreamedIslandVertices(base, { id: 'isle-7', landmark: true });
  assert.notDeepEqual([...ordinary], [...landmark]);
  assert.deepEqual(
    [...profileStreamedIslandVertices(base, { id: 'isle-7', landmark: true })],
    [...landmark],
  );
});

test('malformed or missing identity falls back without mutating caller data', () => {
  const before = [...base];
  const fallback = profileStreamedIslandVertices(base, { id: '' });
  assert.deepEqual([...fallback], before);
  assert.deepEqual([...base], before);
  assert.deepEqual([...profileStreamedIslandVertices([0, Number.NaN, 0], { id: 'bad' })], []);
});
