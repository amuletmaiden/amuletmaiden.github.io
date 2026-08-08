import assert from 'node:assert/strict';
import { deriveSoundscape } from '../src/core/soundscape-model.js';

function close(a, b, epsilon = 1e-9) {
  assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
}

const silent = deriveSoundscape({ ready: false });
assert.equal(silent.active, false);
assert.equal(silent.windGain, 0);
assert.equal(silent.crossingGain, 0);

const paused = deriveSoundscape({
  ready: true,
  paused: true,
  flight: { speed: 180 },
  position: { y: 1200 },
  fog: { effectiveDensity: 0.0001 },
});
assert.equal(paused.active, false);
assert.equal(paused.windGain, 0);

const calm = deriveSoundscape({
  ready: true,
  paused: false,
  flight: { speed: 12 },
  position: { y: 80 },
  fog: { effectiveDensity: 0.0002 },
  currentRegion: { id: 'hushed-reach' },
  routeChoice: { reason: 'idle' },
});
const fast = deriveSoundscape({
  ready: true,
  paused: false,
  flight: { speed: 120 },
  position: { y: 900 },
  fog: { effectiveDensity: 0.0002 },
  currentRegion: { id: 'hushed-reach' },
  routeChoice: { reason: 'active-crossing' },
});
assert.ok(fast.windGain > calm.windGain);
assert.ok(fast.windCutoff > calm.windCutoff);
assert.equal(calm.crossingGain, 0);
assert.ok(fast.crossingGain > 0);
assert.ok(fast.crossingRate > 0);
close(fast.toneFrequency, calm.toneFrequency);

const denseFog = deriveSoundscape({
  ready: true,
  flight: { speed: 80 },
  position: { y: 500 },
  fog: { effectiveDensity: 0.0008 },
  currentRegion: { id: 'hushed-reach' },
});
const clearFog = deriveSoundscape({
  ready: true,
  flight: { speed: 80 },
  position: { y: 500 },
  fog: { effectiveDensity: 0.00005 },
  currentRegion: { id: 'hushed-reach' },
});
assert.ok(denseFog.windCutoff < clearFog.windCutoff);
assert.ok(denseFog.toneGain < clearFog.toneGain);

const regionA = deriveSoundscape({ ready: true, currentRegion: { id: 'blueglass-wake' } });
const regionB = deriveSoundscape({ ready: true, currentRegion: { id: 'far-choir' } });
assert.notEqual(regionA.toneFrequency, regionB.toneFrequency);
assert.equal(regionA.toneFrequency, deriveSoundscape({ ready: true, currentRegion: { id: 'blueglass-wake' } }).toneFrequency);

const malformed = deriveSoundscape({
  ready: true,
  flight: { speed: Number.NaN },
  position: { y: Number.POSITIVE_INFINITY },
  fog: { effectiveDensity: 'bad' },
  currentRegion: { id: { nope: true } },
  routeChoice: { reason: 'active-crossing' },
});
for (const key of ['windGain', 'windCutoff', 'toneGain', 'toneFrequency', 'crossingGain', 'crossingRate']) {
  assert.equal(Number.isFinite(malformed[key]), true, key);
}
assert.equal(Object.isFrozen(malformed), true);
assert.ok(JSON.stringify(malformed).length < 500);

console.log('soundscape model tests passed');
