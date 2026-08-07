import assert from 'node:assert/strict';
import { createAtmosphereResponseModel } from '../src/interface/live-atmosphere-response-model.js';

function state(overrides = {}) {
  return {
    flight: { speed: 42 },
    position: { y: 140 },
    surface: { height: 0, surface: 'water' },
    fog: { effectiveDensity: 0.00042 },
    currentRegion: { name: 'Greyblue Reach' },
    ...overrides,
  };
}

{
  const model = createAtmosphereResponseModel();
  const snapshot = model.update(state());
  assert.equal(snapshot.mode, 'cruise');
  assert.equal(snapshot.regionName, 'Greyblue Reach');
  assert.ok(snapshot.speedPressure > 0);
  assert.ok(snapshot.speedPressure < 1);
  assert.equal(snapshot.changed, true);
  assert.equal(model.update(state()).changed, false);
}

{
  const model = createAtmosphereResponseModel();
  assert.equal(model.update(state({ position: { y: 18 } })).mode, 'water-skim');
  assert.equal(model.update(state({ position: { y: 18 }, surface: { height: 8, surface: 'terrain' } })).mode, 'terrain-skim');
  assert.equal(model.update(state({ flight: { speed: 95 }, position: { y: 180 } })).mode, 'fast');
  assert.equal(model.update(state({ position: { y: 1300 } })).mode, 'high');
  assert.equal(model.update(state({ fog: { effectiveDensity: 0.0011 } })).mode, 'fog');
}

{
  const model = createAtmosphereResponseModel();
  const snapshot = model.update({
    flight: { speed: Number.NaN },
    position: { y: Number.POSITIVE_INFINITY },
    surface: { height: Number.NaN, surface: 'terrain' },
    fog: { effectiveDensity: Number.NaN },
    currentRegion: { name: 'x'.repeat(100) },
  });
  assert.equal(snapshot.mode, 'terrain-skim');
  assert.equal(snapshot.regionName.length, 64);
  for (const key of ['speedPressure', 'fogPressure', 'lowClearance', 'waterSkim', 'terrainSkim', 'highAltitude', 'clearance']) {
    assert.equal(Number.isFinite(snapshot[key]), true, key);
  }
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.equal(Object.isFrozen(snapshot), true);
}

console.log('live-atmosphere-response-model: ok');
