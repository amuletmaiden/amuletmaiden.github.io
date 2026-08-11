import assert from 'node:assert/strict';
import { createFlightDebriefSession } from '../src/core/flight-debrief.js';

const session = createFlightDebriefSession();
assert.deepEqual(session.snapshot(), { active: false, categories: [] });
assert.equal(session.record('weather').categories.length, 0);
assert.equal(session.resolve({ safe: true }).completed, false);

session.beginAirborne();
session.record('weather');
session.record('weather');
session.record('crossing');
session.record('secret');
assert.deepEqual(session.snapshot(), { active: true, categories: ['crossing', 'weather'] });

assert.equal(session.resolve({ safe: false }).completed, false);
assert.equal(session.resolve({ safe: true, recovering: true }).completed, false);
assert.equal(session.resolve({ safe: true, restoring: true }).completed, false);
assert.deepEqual(session.snapshot(), { active: true, categories: ['crossing', 'weather'] });

const rich = session.resolve({ safe: true });
assert.equal(rich.completed, true);
assert.deepEqual(rich.lines, [
  'You crossed open air and made landfall.',
  'You flew the full weather column.',
]);
assert.equal(rich.text.includes('2'), false);
assert.deepEqual(session.snapshot(), { active: false, categories: [] });

session.beginAirborne();
session.record('mystery');
const single = session.resolve({ safe: true });
assert.deepEqual(single, {
  completed: true,
  lines: ['You carried a question through the mist.'],
  text: 'You carried a question through the mist.',
});

session.beginAirborne();
session.record('terrain');
session.reset();
assert.equal(session.resolve({ safe: true }).completed, false);

console.log('flight-debrief regressions: ok');
