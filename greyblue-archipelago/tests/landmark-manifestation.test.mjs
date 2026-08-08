import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectInvestigatedLandmarkIds,
  evaluateLandmarkManifestation,
  manifestationIntensity,
} from '../src/core/landmark-manifestation.js';

function islandFixture(overrides = {}) {
  return {
    id: 'isle-7',
    landmarkRecord: {
      id: 'isle-7:landmark',
      encounter: { class: 'resonance' },
    },
    ...overrides,
  };
}

test('restores distinct investigated landmark ids from durable exploration events', () => {
  const ids = collectInvestigatedLandmarkIds({
    events: [
      { kind: 'landmark-investigated', landmarkId: 'isle-7:landmark' },
      { kind: 'landmark-investigated', landmarkId: 'isle-7:landmark' },
      { kind: 'landmark-arrived', landmarkId: 'isle-8:landmark' },
      { kind: 'landmark-investigated', id: 'isle-9:landmark' },
      null,
    ],
  });
  assert.deepEqual([...ids].sort(), ['isle-7:landmark', 'isle-9:landmark']);
});

test('requires both island discovery and truthful investigation before manifestation', () => {
  const hidden = evaluateLandmarkManifestation({
    island: islandFixture(),
    discoveredIslandIds: [],
    investigatedLandmarkIds: ['isle-7:landmark'],
  });
  assert.equal(hidden.active, false);
  assert.equal(hidden.reason, 'undiscovered');

  const untouched = evaluateLandmarkManifestation({
    island: islandFixture(),
    discoveredIslandIds: ['isle-7'],
    investigatedLandmarkIds: [],
  });
  assert.equal(untouched.active, false);
  assert.equal(untouched.reason, 'uninvestigated');

  const manifested = evaluateLandmarkManifestation({
    island: islandFixture(),
    discoveredIslandIds: ['isle-7'],
    investigatedLandmarkIds: ['isle-7:landmark'],
  });
  assert.equal(manifested.active, true);
  assert.equal(manifested.reason, 'manifested');
  assert.equal(manifested.landmarkId, 'isle-7:landmark');
  assert.equal(Number.isFinite(manifested.phase), true);
});

test('stream reconstruction yields the same deterministic visual profile', () => {
  const input = {
    island: islandFixture(),
    discoveredIslandIds: ['isle-7'],
    investigatedLandmarkIds: new Set(['isle-7:landmark']),
  };
  assert.deepEqual(
    evaluateLandmarkManifestation(input),
    evaluateLandmarkManifestation(input),
  );
});

test('encounter classes remain bounded and unknown classes use the restrained fallback', () => {
  for (const encounterClass of ['resonance', 'instrument', 'relic', 'threshold', 'future-class']) {
    const result = evaluateLandmarkManifestation({
      island: islandFixture({
        id: `isle-${encounterClass}`,
        landmarkRecord: {
          id: `isle-${encounterClass}:landmark`,
          encounter: { class: encounterClass },
        },
      }),
      discoveredIslandIds: [`isle-${encounterClass}`],
      investigatedLandmarkIds: [`isle-${encounterClass}:landmark`],
    });
    assert.equal(result.active, true);
    assert.equal(result.baseIntensity >= 0 && result.baseIntensity <= 0.35, true);
    assert.equal(result.pulseAmplitude >= 0 && result.pulseAmplitude <= 0.1, true);
    assert.equal(result.pulseHz >= 0 && result.pulseHz <= 0.2, true);
  }
});

test('pulse remains finite and bounded, while reduced motion becomes steady', () => {
  const profile = evaluateLandmarkManifestation({
    island: islandFixture(),
    discoveredIslandIds: ['isle-7'],
    investigatedLandmarkIds: ['isle-7:landmark'],
  });
  for (const time of [0, 1, 1000, Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = manifestationIntensity(profile, time);
    assert.equal(Number.isFinite(value), true);
    assert.equal(value >= 0 && value <= 0.35, true);
  }
  assert.equal(
    manifestationIntensity(profile, 0, { reducedMotion: true }),
    manifestationIntensity(profile, 999, { reducedMotion: true }),
  );
});

test('malformed state fails closed and does not mutate caller-owned records', () => {
  const source = islandFixture();
  const before = JSON.stringify(source);
  const malformed = evaluateLandmarkManifestation({
    island: source,
    discoveredIslandIds: 'isle-7',
    investigatedLandmarkIds: { bad: true },
  });
  assert.equal(malformed.active, false);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(malformed), true);

  assert.equal(evaluateLandmarkManifestation({ island: null }).active, false);
  assert.equal(evaluateLandmarkManifestation({ island: { id: 'plain' } }).active, false);
});
