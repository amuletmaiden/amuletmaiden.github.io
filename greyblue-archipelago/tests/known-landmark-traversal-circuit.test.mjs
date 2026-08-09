import assert from 'node:assert/strict';
import {
  knownLandmarkTraversalCircuitPublicState,
  stepKnownLandmarkTraversalCircuit,
} from '../src/core/known-landmark-traversal-circuit.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'a', regionId: 'r1', name: 'A', landmarkRecord: Object.freeze({ id: 'la', title: 'A · bell' }) }),
    Object.freeze({ id: 'b', regionId: 'r1', name: 'B', landmarkRecord: Object.freeze({ id: 'lb', title: 'B · lens' }) }),
    Object.freeze({ id: 'c', regionId: 'r1', name: 'C', landmarkRecord: Object.freeze({ id: 'lc', title: 'C · shrine' }) }),
    Object.freeze({ id: 'd', regionId: 'r1', name: 'D', landmarkRecord: Object.freeze({ id: 'ld', title: 'D · gate' }) }),
    Object.freeze({ id: 'x', regionId: 'r2', name: 'X', landmarkRecord: Object.freeze({ id: 'lx', title: 'X · organ' }) }),
  ]),
});

const base = Object.freeze({
  world,
  currentRegionId: 'r1',
  discoveredIslandIds: Object.freeze(['a', 'b', 'c', 'd']),
  investigatedLandmarkIds: Object.freeze(['la', 'lb', 'lc', 'ld']),
});

const ready = stepKnownLandmarkTraversalCircuit(base);
assert.deepEqual(knownLandmarkTraversalCircuitPublicState(ready), {
  available: true, active: false, phase: 'ready', nextLabel: null, completed: false,
});

const started = stepKnownLandmarkTraversalCircuit({ ...base, startRequested: true });
assert.equal(started.active, true);
assert.equal(started.circuit.circuit.length, 3);
assert.equal(new Set(started.circuit.circuit.map((step) => step.landmarkId)).size, 3);
assert.equal(knownLandmarkTraversalCircuitPublicState(started).phase, 'seeking');
assert.equal(typeof knownLandmarkTraversalCircuitPublicState(started).nextLabel, 'string');

const startedAgain = stepKnownLandmarkTraversalCircuit({ ...base, startRequested: true });
assert.deepEqual(
  started.circuit.circuit.map((step) => step.landmarkId),
  startedAgain.circuit.circuit.map((step) => step.landmarkId),
);

const expected0 = started.circuit.circuit[0];
const wrongPlace = stepKnownLandmarkTraversalCircuit({
  ...base,
  state: started.circuit,
  interactionRequested: true,
  encounterPresent: true,
  currentIslandId: 'x',
  currentLandmarkId: 'lx',
});
assert.equal(wrongPlace.circuit.stepIndex, 0);
assert.equal(wrongPlace.phase, 'seeking');

const passive = stepKnownLandmarkTraversalCircuit({
  ...base,
  state: started.circuit,
  encounterPresent: true,
  currentIslandId: expected0.islandId,
  currentLandmarkId: expected0.landmarkId,
});
assert.equal(passive.circuit.stepIndex, 0);

const advanced = stepKnownLandmarkTraversalCircuit({
  ...base,
  state: started.circuit,
  interactionRequested: true,
  encounterPresent: true,
  currentIslandId: expected0.islandId,
  currentLandmarkId: expected0.landmarkId,
});
assert.equal(advanced.phase, 'advanced');
assert.equal(advanced.circuit.stepIndex, 1);

let current = advanced;
for (let index = 1; index < 3; index += 1) {
  const expected = current.circuit.circuit[current.circuit.stepIndex];
  current = stepKnownLandmarkTraversalCircuit({
    ...base,
    state: current.circuit,
    interactionRequested: true,
    encounterPresent: true,
    currentIslandId: expected.islandId,
    currentLandmarkId: expected.landmarkId,
  });
}
assert.equal(current.completed, true);
assert.equal(current.active, false);
assert.equal(current.circuit, null);
assert.deepEqual(knownLandmarkTraversalCircuitPublicState(current), {
  available: true, active: false, phase: 'completed', nextLabel: null, completed: true,
});

for (const blocked of [
  { recoveryActive: true },
  { crossingActive: true },
  { restorePublishing: true },
]) {
  const result = stepKnownLandmarkTraversalCircuit({ ...base, ...blocked, startRequested: true });
  assert.equal(result.active, false);
  assert.equal(result.available, false);
}

const hiddenFiltered = stepKnownLandmarkTraversalCircuit({
  ...base,
  discoveredIslandIds: ['a', 'b', 'c'],
  investigatedLandmarkIds: ['la', 'lb'],
  startRequested: true,
});
assert.equal(hiddenFiltered.available, false);
assert.equal(hiddenFiltered.active, false);

const wrongRegionEvidence = stepKnownLandmarkTraversalCircuit({
  ...base,
  discoveredIslandIds: ['a', 'b', 'x'],
  investigatedLandmarkIds: ['la', 'lb', 'lx'],
  startRequested: true,
});
assert.equal(wrongRegionEvidence.available, false);

const malformed = stepKnownLandmarkTraversalCircuit({ world: { islands: 'bad' }, startRequested: true });
assert.equal(malformed.active, false);

const publicState = knownLandmarkTraversalCircuitPublicState(started);
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'nextLabel', 'phase']);
assert.equal('circuit' in publicState, false);
assert.equal('landmarkId' in publicState, false);
assert.equal('islandId' in publicState, false);

const beforeWorld = JSON.stringify(world);
stepKnownLandmarkTraversalCircuit({ ...base, startRequested: true, reducedMotion: true, audioEnabled: false });
assert.equal(JSON.stringify(world), beforeWorld);
assert.deepEqual(base.discoveredIslandIds, ['a', 'b', 'c', 'd']);
assert.deepEqual(base.investigatedLandmarkIds, ['la', 'lb', 'lc', 'ld']);

console.log('known-landmark-traversal-circuit: deterministic regressions passed');
