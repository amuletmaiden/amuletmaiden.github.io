import assert from 'node:assert/strict';
import {
  deriveFlightIntentionStrongSurface,
  resolveFlightIntentionDensity,
  flightIntentionPresentation,
  nextFlightIntentionAnnouncement,
} from '../src/interface/flight-intention-view.js';

assert.equal(deriveFlightIntentionStrongSurface(), false);
for (const key of ['safety', 'landing', 'landmark', 'crossing', 'guidance', 'approach']) {
  assert.equal(deriveFlightIntentionStrongSurface({ [key]: true }), true, `${key} suppresses intention`);
}
assert.equal(deriveFlightIntentionStrongSurface({ errorText: '  collision warning  ' }), true);
assert.equal(deriveFlightIntentionStrongSurface({ errorText: '   ' }), false);

assert.equal(resolveFlightIntentionDensity('expanded', 'focused'), 'expanded');
assert.equal(resolveFlightIntentionDensity('', 'expanded'), 'expanded');
assert.equal(resolveFlightIntentionDensity('bogus', 'bogus'), 'focused');

assert.deepEqual(
  flightIntentionPresentation({ density: 'expanded', reducedMotion: true, highContrast: true }),
  { density: 'expanded', motion: 'reduced', contrast: 'high' },
);
assert.deepEqual(
  flightIntentionPresentation({ density: 'focused', reducedMotion: false, highContrast: false }),
  { density: 'focused', motion: 'standard', contrast: 'standard' },
);

const intention = { visible: true, kind: 'cloudbreak', phase: 'cruise', text: 'Stay above the mist.' };
const first = nextFlightIntentionAnnouncement(intention, '');
assert.deepEqual(first, { key: 'cloudbreak|cruise', text: 'Stay above the mist.', changed: true });
const repeated = nextFlightIntentionAnnouncement({ ...intention, text: 'Different visual copy.' }, first.key);
assert.deepEqual(repeated, { key: first.key, text: '', changed: false });
const phaseChange = nextFlightIntentionAnnouncement({ ...intention, phase: 'return', text: 'Descend through the grey.' }, first.key);
assert.deepEqual(phaseChange, { key: 'cloudbreak|return', text: 'Descend through the grey.', changed: true });
const hidden = nextFlightIntentionAnnouncement({ visible: false }, phaseChange.key);
assert.deepEqual(hidden, { key: '', text: '', changed: true });
const hiddenAgain = nextFlightIntentionAnnouncement({ visible: false }, '');
assert.deepEqual(hiddenAgain, { key: '', text: '', changed: false });

console.log('flight-intention-view regressions: ok');
