import assert from 'node:assert/strict';
import {
  advanceRidgeToCloudAscent,
  createRidgeToCloudAscentState,
  ridgeToCloudAscentPublicState,
} from '../src/core/ridge-to-cloud-ascent.js';

const base = {
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  crossingActive: false,
  restorePublishing: false,
  currentRegionId: 'west-mist',
};

let state = createRidgeToCloudAscentState();
state = advanceRidgeToCloudAscent(state, { ...base, ridgeCompleted: true, position: { x: 0, y: 40, z: 0 } });
assert.deepEqual(ridgeToCloudAscentPublicState(state), { available: true, active: true, phase: 'depart', completed: false });

state = advanceRidgeToCloudAscent(state, { ...base, position: { x: 100, y: 80, z: 0 } });
state = advanceRidgeToCloudAscent(state, { ...base, position: { x: 200, y: 135, z: 0 } });
state = advanceRidgeToCloudAscent(state, { ...base, position: { x: 300, y: 150, z: 0 } });
assert.equal(ridgeToCloudAscentPublicState(state).phase, 'climb');

const premature = advanceRidgeToCloudAscent(state, { ...base, cloudbreakCompleted: true, position: { x: 301, y: 151, z: 0 } });
assert.equal(premature.completed, false);

state = advanceRidgeToCloudAscent(state, { ...base, position: { x: 390, y: 160, z: 0 } });
state = advanceRidgeToCloudAscent(state, { ...base, cloudbreakCompleted: true, position: { x: 405, y: 165, z: 0 } });
assert.deepEqual(ridgeToCloudAscentPublicState(state), { available: true, active: false, phase: 'clear', completed: true });

let reset = createRidgeToCloudAscentState();
reset = advanceRidgeToCloudAscent(reset, { ...base, ridgeCompleted: true, position: { x: 0, y: 0, z: 0 } });
reset = advanceRidgeToCloudAscent(reset, { ...base, currentRegionId: 'east-mist', position: { x: 40, y: 40, z: 0 } });
assert.equal(reset.active, false);

let hover = createRidgeToCloudAscentState();
hover = advanceRidgeToCloudAscent(hover, { ...base, ridgeCompleted: true, position: { x: 0, y: 0, z: 0 } });
for (let i = 0; i < 20; i += 1) hover = advanceRidgeToCloudAscent(hover, { ...base, position: { x: i, y: i, z: 0 } });
assert.equal(hover.travel, 0);

let teleport = createRidgeToCloudAscentState();
teleport = advanceRidgeToCloudAscent(teleport, { ...base, ridgeCompleted: true, position: { x: 0, y: 0, z: 0 } });
teleport = advanceRidgeToCloudAscent(teleport, { ...base, position: { x: 500, y: 200, z: 0 } });
assert.equal(teleport.travel, 0);

const source = { x: 10, y: 20, z: 30 };
let immutable = createRidgeToCloudAscentState();
immutable = advanceRidgeToCloudAscent(immutable, { ...base, ridgeCompleted: true, position: source });
assert.deepEqual(source, { x: 10, y: 20, z: 30 });
assert.deepEqual(Object.keys(ridgeToCloudAscentPublicState(immutable)).sort(), ['active', 'available', 'completed', 'phase']);

console.log('ridge-to-cloud ascent regressions: ok');
