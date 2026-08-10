import assert from 'node:assert/strict';
import {
  advanceMysteryListeningPass,
  armMysteryListeningPass,
  createMysteryListeningPassState,
  mysteryListeningPassPublicState,
} from '../src/core/mystery-listening-pass.js';

const focus = Object.freeze({ x: 0, y: 50, z: 0 });
const baseArm = Object.freeze({ completedArrival: true, landmarkId: 'lm-a', regionId: 'r-a', focusPosition: focus, encounterRadius: 220 });
const live = Object.freeze({ ready: true, airborne: true, regionId: 'r-a', landmarkId: 'lm-a' });

let state = armMysteryListeningPass(createMysteryListeningPassState(), baseArm);
assert.deepEqual(mysteryListeningPassPublicState(state), { available: true, active: true, phase: 'depart', completed: false });
assert.equal(state.focusLandmarkId, 'lm-a');

const premature = advanceMysteryListeningPass(state, { ...live, position: { x: 20, y: 50, z: 0 }, listened: true });
assert.equal(premature.phase, 'depart');
assert.equal(premature.completed, false);

state = advanceMysteryListeningPass(state, { ...live, position: { x: 450, y: 50, z: 0 } });
assert.equal(state.phase, 'return');
assert.equal(state.departed, true);

state = advanceMysteryListeningPass(state, { ...live, position: { x: 150, y: 50, z: 0 } });
assert.equal(state.phase, 'listen');
assert.equal(state.completed, false);

const wrong = advanceMysteryListeningPass(state, { ...live, landmarkId: 'lm-b', position: { x: 150, y: 50, z: 0 }, listened: true });
assert.equal(wrong.completed, false);
assert.equal(wrong.active, false);

state = armMysteryListeningPass(createMysteryListeningPassState(), baseArm);
state = advanceMysteryListeningPass(state, { ...live, position: { x: 450, y: 50, z: 0 } });
state = advanceMysteryListeningPass(state, { ...live, position: { x: 150, y: 50, z: 0 }, listened: true });
assert.equal(state.completed, true);
assert.equal(state.active, false);
assert.deepEqual(Object.keys(mysteryListeningPassPublicState(state)).sort(), ['active', 'available', 'completed', 'phase']);

for (const patch of [
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
  { regionId: 'r-b' },
  { position: { x: NaN, y: 0, z: 0 } },
]) {
  let attempt = armMysteryListeningPass(createMysteryListeningPassState(), baseArm);
  attempt = advanceMysteryListeningPass(attempt, { ...live, position: { x: 450, y: 50, z: 0 }, ...patch });
  assert.equal(attempt.active, false);
  assert.equal(attempt.completed, false);
}

const source = { completedArrival: true, landmarkId: 'lm-a', regionId: 'r-a', focusPosition: { x: 1, y: 2, z: 3 }, encounterRadius: 220 };
armMysteryListeningPass(createMysteryListeningPassState(), source);
assert.deepEqual(source.focusPosition, { x: 1, y: 2, z: 3 });

console.log('mystery-listening-pass regressions passed');
