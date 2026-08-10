import assert from 'node:assert/strict';
import {
  createHighAirLandfallCheckpointState,
  planHighAirLandfallCheckpoint,
} from '../src/core/high-air-landfall-checkpoint.js';

const runtime = Object.freeze({
  ready: true,
  paused: false,
  collision: Object.freeze({ requiresRecovery: false }),
  flight: Object.freeze({ mode: 'flight' }),
  restorePublishing: false,
  explorationRestorePublishing: false,
  currentRegion: Object.freeze({ id: 'region-b' }),
  discovered: Object.freeze(['island-b']),
  position: Object.freeze({ x: 1010, y: 40, z: 510 }),
});
const completion = Object.freeze({
  event: 'completed',
  completed: true,
  phase: 'settle',
  active: false,
  available: true,
});

let state = createHighAirLandfallCheckpointState();
let plan = planHighAirLandfallCheckpoint({ policyState: state, eventDetail: completion, runtimeState: runtime });
assert.equal(plan.shouldCheckpoint, true);
assert.equal(plan.nextPolicyState.consumed, true);
state = plan.nextPolicyState;

plan = planHighAirLandfallCheckpoint({ policyState: state, eventDetail: completion, runtimeState: runtime });
assert.equal(plan.shouldCheckpoint, false);
assert.equal(plan.nextPolicyState, state);

for (const runtimeState of [
  { ...runtime, ready: false },
  { ...runtime, paused: true },
  { ...runtime, collision: { requiresRecovery: true } },
  { ...runtime, flight: { mode: 'recovery' } },
  { ...runtime, restorePublishing: true },
  { ...runtime, explorationRestorePublishing: true },
  { ...runtime, currentRegion: null },
  { ...runtime, discovered: null },
  { ...runtime, position: { x: Number.NaN, y: 40, z: 510 } },
]) {
  const rejected = planHighAirLandfallCheckpoint({
    policyState: createHighAirLandfallCheckpointState(),
    eventDetail: completion,
    runtimeState,
  });
  assert.equal(rejected.shouldCheckpoint, false);
  assert.equal(rejected.nextPolicyState.consumed, false);
}

for (const eventDetail of [
  null,
  { ...completion, event: 'progress' },
  { ...completion, completed: false },
  { ...completion, phase: 'approach' },
]) {
  const rejected = planHighAirLandfallCheckpoint({
    policyState: createHighAirLandfallCheckpointState(),
    eventDetail,
    runtimeState: runtime,
  });
  assert.equal(rejected.shouldCheckpoint, false);
}

assert.deepEqual(Object.keys(completion).sort(), ['active', 'available', 'completed', 'event', 'phase']);
console.log('high-air-landfall checkpoint regressions: ok');
