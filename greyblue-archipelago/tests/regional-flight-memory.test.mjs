import assert from 'node:assert/strict';
import {
  collectRegionalFlightMemories,
  deriveRegionalFlightMemoryEvent,
  regionalFlightMemoryClass,
  regionalFlightMemoryPublicState,
} from '../src/core/regional-flight-memory.js';

const complete = Object.freeze({ event: 'completed', completed: true, active: false, phase: 'completed' });

const earned = deriveRegionalFlightMemoryEvent({
  circuitEvent: complete,
  currentRegionId: 'north-mist',
  occurredAt: 42,
});
assert.equal(earned.kind, 'regional-flight-memory');
assert.equal(earned.id, 'north-mist');
assert.equal(earned.regionId, 'north-mist');
assert.equal(earned.memoryClass, regionalFlightMemoryClass('north-mist'));
assert.equal(earned.occurredAt, 42);
assert.deepEqual(Object.keys(earned).sort(), ['id', 'kind', 'memoryClass', 'occurredAt', 'regionId']);

for (const bad of [
  null,
  { event: 'started', completed: false },
  { event: 'advanced', completed: false },
  { event: 'completed', completed: false },
]) {
  assert.equal(deriveRegionalFlightMemoryEvent({ circuitEvent: bad, currentRegionId: 'north-mist' }), null);
}
assert.equal(deriveRegionalFlightMemoryEvent({ circuitEvent: complete, currentRegionId: '' }), null);
assert.equal(deriveRegionalFlightMemoryEvent({ circuitEvent: complete, currentRegionId: 'north-mist', recoveryActive: true }), null);
assert.equal(deriveRegionalFlightMemoryEvent({ circuitEvent: complete, currentRegionId: 'north-mist', crossingActive: true }), null);
assert.equal(deriveRegionalFlightMemoryEvent({ circuitEvent: complete, currentRegionId: 'north-mist', restorePublishing: true }), null);

assert.equal(regionalFlightMemoryClass('north-mist'), regionalFlightMemoryClass('north-mist'));
assert.ok(['wake', 'ring', 'hush', 'weathering'].includes(regionalFlightMemoryClass('north-mist')));
assert.equal(regionalFlightMemoryClass(null), null);

const exploration = {
  version: 1,
  events: [
    earned,
    { ...earned, memoryClass: 'ring', occurredAt: 99 },
    { kind: 'regional-flight-memory', id: 'bad', regionId: 'bad', memoryClass: 'secret-class', coordinates: [1, 2, 3] },
    { kind: 'landmark-investigated', id: 'elsewhere', regionId: 'south' },
  ],
};
const memories = collectRegionalFlightMemories(exploration);
assert.equal(memories.size, 1);
assert.deepEqual(memories.get('north-mist'), { regionId: 'north-mist', memoryClass: earned.memoryClass });

assert.deepEqual(
  regionalFlightMemoryPublicState({ exploration, currentRegionId: 'north-mist' }),
  { active: true, remembered: true, memoryClass: earned.memoryClass },
);
assert.deepEqual(
  regionalFlightMemoryPublicState({ exploration, currentRegionId: 'south' }),
  { active: false, remembered: false, memoryClass: null },
);
assert.deepEqual(
  regionalFlightMemoryPublicState({ exploration: { events: [{ ...earned, coordinates: [9, 9, 9], hiddenRoute: 'x' }] }, currentRegionId: 'north-mist' }),
  { active: true, remembered: true, memoryClass: earned.memoryClass },
);

const caller = { circuitEvent: { ...complete, hiddenCandidates: ['secret'] }, currentRegionId: 'north-mist' };
const before = JSON.stringify(caller);
deriveRegionalFlightMemoryEvent(caller);
assert.equal(JSON.stringify(caller), before);

console.log('regional-flight-memory regressions passed');
