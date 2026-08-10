import assert from 'node:assert/strict';
import {
  createOptionalFramePressureState,
  optionalPresentationBudget,
  publicOptionalFramePressureState,
  stepOptionalFramePressure,
} from '../src/core/optional-frame-pressure.js';

function repeat(state, deltaMs, count) {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = stepOptionalFramePressure(next, { deltaMs });
  }
  return next;
}

const initial = createOptionalFramePressureState();
assert.deepEqual(publicOptionalFramePressureState(initial), { active: false, pressureClass: null });

const healthy = repeat(initial, 16, 180);
assert.equal(healthy.pressureClass, null, 'ordinary healthy cadence never manufactures pressure');

const oneHitch = stepOptionalFramePressure(healthy, { deltaMs: 80 });
assert.equal(oneHitch.pressureClass, null, 'one isolated hitch does not collapse presentation');

const strained = repeat(createOptionalFramePressureState(), 32, 15);
assert.equal(strained.pressureClass, 'strained', 'sustained slow cadence enters strained pressure');
assert.deepEqual(publicOptionalFramePressureState(strained), { active: true, pressureClass: 'strained' });

const critical = repeat(createOptionalFramePressureState(), 50, 6);
assert.equal(critical.pressureClass, 'critical', 'sustained severe cadence enters critical pressure');
assert.deepEqual(publicOptionalFramePressureState(critical), { active: true, pressureClass: 'critical' });

let criticalPrecedence = repeat(createOptionalFramePressureState(), 32, 14);
criticalPrecedence = repeat(criticalPrecedence, 50, 6);
assert.equal(criticalPrecedence.pressureClass, 'critical', 'critical pressure supersedes strained pressure');

const partialRecovery = repeat(critical, 16, 30);
assert.equal(partialRecovery.pressureClass, 'critical', 'short healthy interval preserves hysteresis');
const recovered = repeat(partialRecovery, 16, 30);
assert.equal(recovered.pressureClass, null, 'sustained healthy cadence restores full presentation');

const malformedBase = repeat(createOptionalFramePressureState(), 32, 10);
const malformedBefore = JSON.stringify(malformedBase);
assert.deepEqual(stepOptionalFramePressure(malformedBase, { deltaMs: NaN }), malformedBase);
assert.deepEqual(stepOptionalFramePressure(malformedBase, { deltaMs: -1 }), malformedBase);
assert.deepEqual(stepOptionalFramePressure(malformedBase, { deltaMs: 1200 }), malformedBase, 'background-sized gaps are ignored');
assert.equal(JSON.stringify(malformedBase), malformedBefore, 'stepping never mutates caller-owned state');

assert.deepEqual(optionalPresentationBudget(createOptionalFramePressureState()), {
  historyScale: 1,
  animationScale: 1,
  optionalCueCapScale: 1,
});
assert.deepEqual(optionalPresentationBudget(strained), {
  historyScale: 0.55,
  animationScale: 0.65,
  optionalCueCapScale: 0.7,
});
assert.deepEqual(optionalPresentationBudget(critical), {
  historyScale: 0.25,
  animationScale: 0.35,
  optionalCueCapScale: 0.45,
});
assert.deepEqual(optionalPresentationBudget(initial, { reducedMotion: true }), {
  historyScale: 0.35,
  animationScale: 0.45,
  optionalCueCapScale: 1,
}, 'reduced motion contracts presentation without manufacturing pressure');
assert.deepEqual(publicOptionalFramePressureState({ pressureClass: 'unknown', hidden: 123 }), {
  active: false,
  pressureClass: null,
}, 'public state strips malformed and hidden evidence');
assert.deepEqual(Object.keys(publicOptionalFramePressureState(critical)).sort(), ['active', 'pressureClass']);

for (const budget of [
  optionalPresentationBudget(initial),
  optionalPresentationBudget(strained),
  optionalPresentationBudget(critical),
  optionalPresentationBudget(initial, { reducedMotion: true }),
]) {
  for (const value of Object.values(budget)) {
    assert.equal(Number.isFinite(value) && value > 0 && value <= 1, true, 'presentation budgets stay bounded');
  }
}

console.log('optional-frame-pressure: ok');
