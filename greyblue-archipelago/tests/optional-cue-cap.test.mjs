import assert from 'node:assert/strict';
import { retainOptionalCuePrefix } from '../src/core/optional-cue-cap.js';

const cues = Object.freeze([
  Object.freeze({ id: 'nearest' }),
  Object.freeze({ id: 'second' }),
  Object.freeze({ id: 'third' }),
  Object.freeze({ id: 'fourth' }),
  Object.freeze({ id: 'fifth' }),
  Object.freeze({ id: 'sixth' }),
  Object.freeze({ id: 'seventh' }),
  Object.freeze({ id: 'eighth' }),
]);

assert.deepEqual(
  retainOptionalCuePrefix(cues, { optionalCueCapScale: 1 }).map((cue) => cue.id),
  cues.map((cue) => cue.id),
  'healthy presentation retains the authored eligible ordering and full cap',
);
assert.deepEqual(
  retainOptionalCuePrefix(cues, { optionalCueCapScale: 0.7 }).map((cue) => cue.id),
  ['nearest', 'second', 'third', 'fourth', 'fifth', 'sixth'],
  'strained presentation keeps a stable nearest-first prefix',
);
assert.deepEqual(
  retainOptionalCuePrefix(cues, { optionalCueCapScale: 0.45 }).map((cue) => cue.id),
  ['nearest', 'second', 'third', 'fourth'],
  'critical presentation contracts more aggressively without reordering retained cues',
);
assert.deepEqual(
  retainOptionalCuePrefix([cues[0]], { optionalCueCapScale: 0.01 }).map((cue) => cue.id),
  ['nearest'],
  'at least one already-eligible cue remains visible',
);
assert.deepEqual(
  retainOptionalCuePrefix(cues.slice(0, 3), { optionalCueCapScale: Number.NaN }).map((cue) => cue.id),
  ['nearest', 'second', 'third'],
  'malformed budgets fail open to the caller-authored eligible cap',
);
assert.deepEqual(retainOptionalCuePrefix(null, { optionalCueCapScale: 0.45 }), []);
assert.equal(cues.length, 8, 'caller-owned cue arrays are not mutated');
assert.equal(cues[0].id, 'nearest', 'caller-owned cue objects are not mutated');
