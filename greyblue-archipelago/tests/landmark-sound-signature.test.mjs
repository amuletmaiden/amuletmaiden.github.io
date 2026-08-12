import assert from 'node:assert/strict';
import { deriveLandmarkSoundSignature } from '../src/core/landmark-sound-signature.js';

for (const encounterClass of ['resonance', 'instrument', 'relic', 'threshold']) {
  assert.deepEqual(
    deriveLandmarkSoundSignature({ active: true, encounterClass }),
    { encounterClass },
    `${encounterClass} preserves only its supported sound class`,
  );
}

for (const input of [
  null,
  {},
  { active: false, encounterClass: 'resonance' },
  { active: true, encounterClass: 'unknown' },
  { active: true, encounterClass: null },
]) {
  assert.equal(deriveLandmarkSoundSignature(input ?? undefined), null, 'inactive or malformed evidence is silent');
}

const source = Object.freeze({
  active: true,
  encounterClass: 'instrument',
  text: 'hidden from sound',
  landmarkId: 'hidden-id',
  regionId: 'hidden-region',
  coordinates: Object.freeze({ x: 1, y: 2, z: 3 }),
});
const result = deriveLandmarkSoundSignature(source);
assert.deepEqual(Object.keys(result), ['encounterClass'], 'sound signature exposes one bounded key');
assert.deepEqual(result, { encounterClass: 'instrument' }, 'text, identity and geometry are stripped');
assert.deepEqual(source, {
  active: true,
  encounterClass: 'instrument',
  text: 'hidden from sound',
  landmarkId: 'hidden-id',
  regionId: 'hidden-region',
  coordinates: { x: 1, y: 2, z: 3 },
}, 'caller evidence remains unmodified');

console.log('landmark sound signature tests passed');
