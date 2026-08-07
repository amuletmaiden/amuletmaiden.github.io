import assert from 'node:assert/strict';
import { deriveFlightInstruments } from '../src/interface/live-flight-instruments-model.js';

{
  const view = deriveFlightInstruments({
    position: { y: 120 },
    surface: { height: 20 },
    flight: { speed: 42.4, velocity: { y: 3 }, mode: 'powered-flight', airborne: true, stallFactor: 0 },
  });
  assert.equal(view.mode, 'POWERED FLIGHT');
  assert.equal(view.speed, '42');
  assert.equal(view.altitude, '120');
  assert.equal(view.clearance, '100');
  assert.equal(view.trend, 'climbing');
  assert.equal(view.caution, '');
}

{
  const view = deriveFlightInstruments({
    position: { y: 14 },
    surface: { height: 2 },
    flight: { speed: 18, velocity: { y: -6 }, airborne: true, stallFactor: 0.1 },
  });
  assert.equal(view.caution, 'GROUND');
  assert.equal(view.trend, 'descending');
}

{
  const view = deriveFlightInstruments({
    position: { y: 90 },
    surface: { height: 0 },
    flight: { speed: 7, velocity: { y: -2 }, airborne: true, stallFactor: 0.8 },
  });
  assert.equal(view.caution, 'STALL');
}

{
  const view = deriveFlightInstruments({
    collision: { requiresRecovery: true },
    flight: { landingRequested: true, stallFactor: 1 },
  });
  assert.equal(view.caution, 'RECOVER');
}

{
  const view = deriveFlightInstruments({
    position: { y: Number.NaN },
    surface: { height: Number.POSITIVE_INFINITY },
    flight: { speed: -20, velocity: { y: 'bad' }, stallFactor: 99 },
  });
  assert.equal(view.speed, '0');
  assert.equal(view.altitude, '0');
  assert.equal(view.clearance, '0');
  assert.equal(view.telemetry.stallFactor, 1);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.telemetry));
  assert.doesNotThrow(() => JSON.stringify(view));
}

console.log('live flight instrument model tests passed');
