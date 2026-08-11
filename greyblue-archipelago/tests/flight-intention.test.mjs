import assert from 'node:assert/strict';
import { deriveFlightIntention } from '../src/interface/flight-intention.js';

const active = (phase, extra = {}) => Object.freeze({
  available: true,
  active: true,
  completed: false,
  phase,
  ...extra,
});

assert.deepEqual(
  deriveFlightIntention(),
  { visible: false, kind: 'none', phase: 'idle', text: '' },
);

const suppressed = deriveFlightIntention({
  strongSurface: true,
  states: { deepMistRun: active('thread') },
});
assert.equal(suppressed.visible, false);

const deepMist = deriveFlightIntention({ states: { deepMistRun: active('thread') } });
assert.deepEqual(deepMist, {
  visible: true,
  kind: 'deep-mist',
  phase: 'thread',
  text: 'Hold a fast line through the grey.',
});

const priority = deriveFlightIntention({
  states: {
    deepMistRun: active('thread'),
    cloudbreakRun: active('cruise'),
    fullColumnWeather: active('rise'),
  },
});
assert.equal(priority.kind, 'full-column');
assert.equal(priority.text, 'Carry the climb upward.');

const hidden = Object.freeze({
  ...active('cross'),
  regionId: 'secret-region',
  targetIslandId: 'secret-island',
  distance: 4321,
  altitude: 999,
});
const crossing = deriveFlightIntention({ states: { highAirCrossing: hidden } });
assert.deepEqual(Object.keys(crossing).sort(), ['kind', 'phase', 'text', 'visible']);
assert.equal(JSON.stringify(crossing).includes('secret'), false);
assert.equal(JSON.stringify(crossing).includes('4321'), false);
assert.equal(JSON.stringify(crossing).includes('999'), false);

const completed = deriveFlightIntention({
  states: {
    cloudbreakRun: Object.freeze({ ...active('return'), active: false, completed: true }),
  },
});
assert.equal(completed.visible, false);

const malformed = deriveFlightIntention({
  states: {
    cloudbreakRun: Object.freeze({ available: true, active: true, completed: false, phase: 'secret-phase' }),
    deepMistRun: active('climb'),
  },
});
assert.equal(malformed.kind, 'deep-mist');
assert.equal(malformed.phase, 'climb');

const caller = {
  highAirLandfall: active('approach', { target: { id: 'do-not-touch' } }),
};
const before = JSON.stringify(caller);
deriveFlightIntention({ states: caller });
assert.equal(JSON.stringify(caller), before);

console.log('flight-intention regressions: ok');
