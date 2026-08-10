import assert from 'node:assert/strict';
import {
  createExitSavePolicyState,
  planPersistenceFlush,
  truthfulExitSaveState,
} from '../src/core/exit-save-policy.js';

const runtime = Object.freeze({
  ready: true,
  paused: false,
  collision: Object.freeze({ requiresRecovery: false }),
  position: Object.freeze({ x: 120, y: 240, z: -80 }),
});

assert.equal(truthfulExitSaveState(runtime), true);
assert.equal(truthfulExitSaveState({ ...runtime, ready: false }), false);
assert.equal(truthfulExitSaveState({ ...runtime, paused: true }), false);
assert.equal(truthfulExitSaveState({ ...runtime, collision: { requiresRecovery: true } }), false);
assert.equal(truthfulExitSaveState({ ...runtime, position: { x: NaN, y: 0, z: 0 } }), false);

const cleanExit = planPersistenceFlush({
  policyState: createExitSavePolicyState(),
  reason: 'pagehide',
  lifecycleDirty: false,
  runtimeState: runtime,
});
assert.equal(cleanExit.shouldFlush, true);
assert.equal(cleanExit.forcedExitSave, true);
assert.equal(cleanExit.nextPolicyState.exitSaved, true);

const duplicateExit = planPersistenceFlush({
  policyState: cleanExit.nextPolicyState,
  reason: 'beforeunload',
  lifecycleDirty: false,
  runtimeState: runtime,
});
assert.equal(duplicateExit.shouldFlush, false);
assert.equal(duplicateExit.forcedExitSave, false);
assert.equal(duplicateExit.nextPolicyState.exitSaved, true);

const dirtyOrdinary = planPersistenceFlush({
  policyState: createExitSavePolicyState(),
  reason: 'discovery',
  lifecycleDirty: true,
  runtimeState: runtime,
});
assert.equal(dirtyOrdinary.shouldFlush, true);
assert.equal(dirtyOrdinary.forcedExitSave, false);
assert.equal(dirtyOrdinary.nextPolicyState.exitSaved, false);

const malformedExit = planPersistenceFlush({
  policyState: createExitSavePolicyState(),
  reason: 'hidden',
  lifecycleDirty: false,
  runtimeState: { ...runtime, position: { x: Infinity, y: 1, z: 1 } },
});
assert.equal(malformedExit.shouldFlush, false);
assert.equal(malformedExit.nextPolicyState.exitSaved, false);

const inputState = createExitSavePolicyState();
const inputRuntime = { ...runtime, position: { ...runtime.position } };
const beforePolicy = JSON.stringify(inputState);
const beforeRuntime = JSON.stringify(inputRuntime);
planPersistenceFlush({ policyState: inputState, reason: 'pagehide', runtimeState: inputRuntime });
assert.equal(JSON.stringify(inputState), beforePolicy);
assert.equal(JSON.stringify(inputRuntime), beforeRuntime);

console.log('exit-save-policy: ok');
