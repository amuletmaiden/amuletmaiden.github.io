import assert from 'node:assert/strict';
import {
  createBankMistArcState,
  stepBankMistArcs,
  bankMistArcPresentation,
  bankMistArcPublicState,
} from '../src/core/bank-mist-arcs.js';

const baseFrame = Object.freeze({
  ready: true,
  paused: false,
  grounded: false,
  recoveryActive: false,
  restorePublishing: false,
  position: Object.freeze({ x: 10, y: 80, z: 20 }),
  speed: 38,
  bank: 0.42,
  yaw: 1.2,
  fogDensity: 0.00105,
});

function step(frame = baseFrame, options = {}) {
  return stepBankMistArcs({ state: createBankMistArcState(), frame, now: 1000, ...options });
}

assert.deepEqual(bankMistArcPublicState(step()), { active: true, turnClass: 'right' });
assert.deepEqual(bankMistArcPublicState(step({ ...baseFrame, bank: -0.42 })), { active: true, turnClass: 'left' });
assert.equal(step({ ...baseFrame, speed: 20 }).samples.length, 0);
assert.equal(step({ ...baseFrame, bank: 0.04 }).samples.length, 0);
assert.equal(step({ ...baseFrame, fogDensity: 0.0004 }).samples.length, 0);
assert.equal(step({ ...baseFrame, grounded: true }).samples.length, 0);
assert.equal(step({ ...baseFrame, paused: true }).samples.length, 0);
assert.equal(step({ ...baseFrame, recoveryActive: true }).samples.length, 0);
assert.equal(step({ ...baseFrame, restorePublishing: true }).samples.length, 0);
assert.equal(step({ ...baseFrame, ready: false }).samples.length, 0);
assert.equal(step({ ...baseFrame, position: { x: NaN, y: 0, z: 0 } }).samples.length, 0);
assert.equal(step({ ...baseFrame, bank: NaN }).samples.length, 0);

let state = createBankMistArcState();
for (let index = 0; index < 20; index += 1) {
  state = stepBankMistArcs({
    state,
    frame: { ...baseFrame, position: { x: index * 7, y: 80, z: 20 } },
    now: 1000 + index * 30,
  });
}
assert.ok(state.samples.length <= 8);
state = stepBankMistArcs({ state, frame: baseFrame, now: 3000 });
assert.equal(state.samples.length, 1);

const reduced = stepBankMistArcs({
  state: {
    turnClass: 'right',
    samples: [
      { x: 0, y: 80, z: 0, occurredAt: 900, turnClass: 'right', yaw: 0, bank: 0.4, strength: 1 },
      { x: 7, y: 80, z: 0, occurredAt: 930, turnClass: 'right', yaw: 0, bank: 0.4, strength: 1 },
      { x: 14, y: 80, z: 0, occurredAt: 960, turnClass: 'right', yaw: 0, bank: 0.4, strength: 1 },
    ],
  },
  frame: { ...baseFrame, position: { x: 21, y: 80, z: 0 } },
  now: 1000,
  reducedMotion: true,
});
assert.ok(reduced.samples.length <= 2);

const publicState = bankMistArcPublicState(state);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'turnClass']);
assert.equal('position' in publicState, false);
assert.equal('speed' in publicState, false);
assert.equal('bank' in publicState, false);
assert.equal('samples' in publicState, false);

const presentation = bankMistArcPresentation(step(), { highContrast: true });
assert.equal(presentation.depthTest, true);
assert.equal(presentation.depthWrite, false);
assert.equal(presentation.fog, true);
assert.ok(presentation.opacity <= 0.42);

const caller = { ...baseFrame, position: { ...baseFrame.position } };
const before = JSON.stringify(caller);
step(caller);
assert.equal(JSON.stringify(caller), before);
