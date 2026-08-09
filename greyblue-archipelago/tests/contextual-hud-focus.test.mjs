import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveContextualHudFocus } from '../src/interface/contextual-hud-focus.js';

test('safety outranks every optional surface', () => {
  const result = deriveContextualHudFocus({
    state: { collision: { requiresRecovery: true } },
    surfaces: { landing: true, interaction: true, crossing: true, guidance: true, expedition: true },
  });
  assert.equal(result.focus, 'safety');
  assert.equal(result.safety, true);
  assert.equal(result.telemetry.focus, 'safety');
  assert.ok(!Object.keys(result.telemetry).some((key) => /route|island|position|progress/i.test(key)));
});

test('landing then interaction then crossing then guidance then expedition define focus order', () => {
  assert.equal(deriveContextualHudFocus({ surfaces: { landing: true, interaction: true } }).focus, 'landing');
  assert.equal(deriveContextualHudFocus({ surfaces: { interaction: true, crossing: true } }).focus, 'interaction');
  assert.equal(deriveContextualHudFocus({ surfaces: { crossing: true, guidance: true } }).focus, 'crossing');
  assert.equal(deriveContextualHudFocus({ surfaces: { guidance: true, expedition: true } }).focus, 'guidance');
  assert.equal(deriveContextualHudFocus({ surfaces: { expedition: true } }).focus, 'expedition');
  assert.equal(deriveContextualHudFocus().focus, 'flight');
});

test('stall and descending terrain danger remain safety signals', () => {
  assert.equal(deriveContextualHudFocus({ state: { flight: { stallFactor: 0.7 } } }).focus, 'safety');
  assert.equal(deriveContextualHudFocus({
    state: { flight: { airborne: true, velocity: { y: -7 } }, position: { y: 12 }, surface: { height: 0 } },
  }).focus, 'safety');
});

test('focused density only de-emphasizes lower priority surfaces without hiding journal truth', () => {
  const result = deriveContextualHudFocus({
    surfaces: { interaction: true, crossing: true, guidance: true, expedition: true, journalOpen: true },
  });
  assert.equal(result.focus, 'interaction');
  assert.equal(result.journalOpen, true);
  assert.deepEqual(result.dimmedSurfaceIds, ['flight', 'landing', 'crossing', 'guidance', 'expedition']);
});

test('expanded density never de-emphasizes a surface', () => {
  const result = deriveContextualHudFocus({
    density: 'expanded',
    surfaces: { landing: true, interaction: true, crossing: true, guidance: true, expedition: true },
  });
  assert.equal(result.density, 'expanded');
  assert.deepEqual(result.dimmedSurfaceIds, []);
});

test('malformed and secret-looking caller data fail closed and never enter public telemetry', () => {
  const input = {
    state: { hiddenRoute: 'secret', position: { x: 'nope' }, flight: { stallFactor: 'nope' } },
    surfaces: { guidance: 'yes', expedition: { destination: 'secret-isle' } },
    density: 'mystery',
  };
  const before = structuredClone(input);
  const result = deriveContextualHudFocus(input);
  assert.equal(result.focus, 'flight');
  assert.equal(result.density, 'focused');
  assert.deepEqual(input, before);
  assert.deepEqual(result.telemetry, { focus: 'flight', density: 'focused' });
});
