import assert from 'node:assert/strict';
import {
  createPrecisionTouchdownState,
  precisionTouchdownPublicState,
  stepPrecisionTouchdown,
} from '../src/core/precision-touchdown-challenge.js';

const cleanApproach = Object.freeze({
  approachShelfId: 'shelf-a',
  approachClass: 'final',
  grounded: false,
  speed: 14,
  descentSpeed: 3.5,
});

const initial = createPrecisionTouchdownState();
assert.deepEqual(
  precisionTouchdownPublicState(initial, cleanApproach),
  { available: true, active: false, phase: null, completed: false },
  'a truthful final approach to a known shelf is available',
);

const armed = stepPrecisionTouchdown(initial, cleanApproach);
assert.equal(armed.status, 'approach');
assert.deepEqual(
  precisionTouchdownPublicState(armed, cleanApproach),
  { available: false, active: true, phase: 'approach', completed: false },
);

const sustained = stepPrecisionTouchdown(armed, { ...cleanApproach, speed: 12, descentSpeed: 2.8 });
assert.equal(sustained.status, 'approach', 'same-shelf clean approach remains armed');

const completed = stepPrecisionTouchdown(sustained, {
  ...cleanApproach,
  grounded: true,
  approachShelfId: '',
  touchdownShelfId: 'shelf-a',
  speed: 9,
  descentSpeed: 2.1,
});
assert.deepEqual(
  precisionTouchdownPublicState(completed),
  { available: false, active: false, phase: 'settle', completed: true },
  'clean same-shelf airborne-to-grounded transition completes once',
);
assert.equal(stepPrecisionTouchdown(completed, cleanApproach).completed, true, 'completion is session-local and latched');

const hardTouchdown = stepPrecisionTouchdown(armed, {
  grounded: true,
  touchdownShelfId: 'shelf-a',
  speed: 28,
  descentSpeed: 8,
});
assert.deepEqual(hardTouchdown, initial, 'hard touchdown fails closed');

const wrongGround = stepPrecisionTouchdown(armed, {
  grounded: true,
  touchdownShelfId: 'shelf-b',
  speed: 8,
  descentSpeed: 2,
});
assert.deepEqual(wrongGround, initial, 'touching unrelated ground does not complete');

assert.deepEqual(
  stepPrecisionTouchdown(armed, { ...cleanApproach, approachShelfId: 'shelf-b' }),
  initial,
  'changing shelf during approach resets the attempt',
);
assert.deepEqual(
  stepPrecisionTouchdown(armed, { ...cleanApproach, recoveryActive: true }),
  initial,
  'recovery cancels the attempt',
);
assert.deepEqual(
  stepPrecisionTouchdown(armed, { ...cleanApproach, restorePublishing: true }),
  initial,
  'restore publication cancels the attempt',
);
assert.deepEqual(
  stepPrecisionTouchdown(initial, { ...cleanApproach, grounded: true, touchdownShelfId: 'shelf-a' }),
  initial,
  'spawning or restoring grounded cannot manufacture completion',
);
assert.deepEqual(
  stepPrecisionTouchdown(initial, { ...cleanApproach, speed: Number.NaN }),
  initial,
  'malformed telemetry cannot arm the challenge',
);

assert.equal(initial.status, 'idle', 'caller-owned prior state is not mutated');
assert.equal(cleanApproach.approachShelfId, 'shelf-a', 'caller-owned input is not mutated');
assert.deepEqual(
  Object.keys(precisionTouchdownPublicState(armed, cleanApproach)).sort(),
  ['active', 'available', 'completed', 'phase'],
  'public state remains bounded and contains no shelf identity or telemetry',
);
