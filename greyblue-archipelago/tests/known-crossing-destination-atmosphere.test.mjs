import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKnownCrossingDestinationAtmosphere,
  knownCrossingDestinationAtmospherePublicState,
  knownCrossingDestinationMistMultiplier,
} from '../src/core/known-crossing-destination-atmosphere.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'a', regionId: 'hushed-reach' }),
    Object.freeze({ id: 'b', regionId: 'blueglass-wake' }),
    Object.freeze({ id: 'c', regionId: 'far-choir' }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: 'route-ab', fromIslandId: 'a', toIslandId: 'b' }),
    Object.freeze({ id: 'route-bc', fromIslandId: 'b', toIslandId: 'c' }),
  ]),
});

function derive(overrides = {}) {
  return deriveKnownCrossingDestinationAtmosphere({
    world,
    activeRouteId: 'route-ab',
    destinationIslandId: 'b',
    discoveredRouteIds: ['route-ab'],
    discoveredIslandIds: ['a', 'b'],
    familiarCrossing: { active: true, familiar: true, signature: 'hush' },
    crossingProgress: 0.5,
    recoveryActive: false,
    ...overrides,
  });
}

test('truthful familiar crossing inherits known destination region atmosphere', () => {
  assert.deepEqual(derive(), { active: true, atmosphereClass: 'glass', stage: 'gathering' });
  assert.deepEqual(knownCrossingDestinationAtmospherePublicState(derive()), {
    active: true,
    atmosphereClass: 'glass',
    stage: 'gathering',
  });
});

test('stage changes qualitatively without publishing progress', () => {
  assert.equal(derive({ crossingProgress: 0.12 }).stage, 'hint');
  assert.equal(derive({ crossingProgress: 0.55 }).stage, 'gathering');
  assert.equal(derive({ crossingProgress: 0.86 }).stage, 'near');
  assert.deepEqual(Object.keys(derive({ crossingProgress: 0.86 })).sort(), ['active', 'atmosphereClass', 'stage']);
});

test('hidden, unfamiliar, selection-only and recovery cases fail closed', () => {
  assert.equal(derive({ discoveredIslandIds: ['a'] }).active, false);
  assert.equal(derive({ discoveredRouteIds: [] }).active, false);
  assert.equal(derive({ familiarCrossing: { active: true, familiar: false } }).active, false);
  assert.equal(derive({ familiarCrossing: { active: false, familiar: true } }).active, false);
  assert.equal(derive({ recoveryActive: true }).active, false);
});

test('destination must be an endpoint of the active discovered route', () => {
  assert.equal(derive({ destinationIslandId: 'c', discoveredIslandIds: ['a', 'b', 'c'] }).active, false);
  assert.equal(derive({ activeRouteId: 'route-bc' }).active, false);
});

test('malformed and completed progress fails closed', () => {
  for (const crossingProgress of [null, undefined, Number.NaN, -1, 0, 1, 2]) {
    assert.equal(derive({ crossingProgress }).active, false);
  }
});

test('mist multiplier remains tightly bounded for every qualitative stage', () => {
  for (const crossingProgress of [0.1, 0.5, 0.9]) {
    const result = derive({ crossingProgress });
    const multiplier = knownCrossingDestinationMistMultiplier(result);
    assert.ok(multiplier >= 0.94 && multiplier <= 1.04);
  }
  assert.equal(knownCrossingDestinationMistMultiplier({ active: false }), 1);
});

test('derivation does not mutate caller data', () => {
  const mutableWorld = JSON.parse(JSON.stringify(world));
  const before = JSON.stringify(mutableWorld);
  derive({ world: mutableWorld });
  assert.equal(JSON.stringify(mutableWorld), before);
});
