import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationLifecycle } from '../src/core/exploration-lifecycle.js';
import { collectRegionalFlightMemories } from '../src/core/regional-flight-memory.js';
import { loadGame, saveGame } from '../src/core/save.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function saveState(exploration) {
  return {
    seed: 1337,
    position: { x: 0, y: 160, z: 0 },
    discovered: ['island-a', 'island-b', 'island-c'],
    discoveredRoutes: [],
    guidance: null,
    exploration,
    settings: {},
  };
}

test('regional flight memory is canonical, idempotent, and survives save/load', () => {
  const lifecycle = createExplorationLifecycle();
  assert.equal(lifecycle.recordRegionalFlightMemory('region-a', 'wake', 1234), true);
  assert.equal(lifecycle.recordRegionalFlightMemory('region-a', 'ring', 9999), false);

  const snapshot = lifecycle.snapshot();
  assert.deepEqual(snapshot.events, [{
    key: 'regional-flight-memory:region-a',
    kind: 'regional-flight-memory',
    id: 'region-a',
    occurredAt: 1234,
    regionId: 'region-a',
    memoryClass: 'wake',
  }]);
  assert.equal(lifecycle.telemetry().regionalFlightMemoryCount, 1);

  const storage = memoryStorage();
  saveGame(saveState(snapshot), storage);
  const restored = loadGame(storage);
  assert.deepEqual(restored.exploration.events, snapshot.events);
  assert.deepEqual(
    collectRegionalFlightMemories(restored.exploration).get('region-a'),
    { regionId: 'region-a', memoryClass: 'wake' },
  );

  const restoredLifecycle = createExplorationLifecycle(restored.exploration);
  assert.equal(restoredLifecycle.recordRegionalFlightMemory('region-a', 'wake', 5555), false);
  assert.equal(restoredLifecycle.telemetry().regionalFlightMemoryCount, 1);
});

test('invalid qualitative classes fail closed in lifecycle and save normalization', () => {
  const lifecycle = createExplorationLifecycle({
    events: [
      { kind: 'regional-flight-memory', id: 'region-a', regionId: 'region-a', memoryClass: 'coordinates:1,2', occurredAt: 1 },
      { kind: 'regional-flight-memory', id: 'region-b', regionId: 'region-b', memoryClass: 'hush', occurredAt: 2, coordinates: [1, 2] },
      { kind: 'regional-flight-memory', id: '', regionId: 'region-c', memoryClass: 'ring', occurredAt: 3 },
    ],
  });

  assert.equal(lifecycle.telemetry().regionalFlightMemoryCount, 1);
  assert.deepEqual(lifecycle.snapshot().events[0], {
    key: 'regional-flight-memory:region-b',
    kind: 'regional-flight-memory',
    id: 'region-b',
    occurredAt: 2,
    regionId: 'region-b',
    memoryClass: 'hush',
  });
  assert.equal(lifecycle.recordRegionalFlightMemory('region-c', 'unknown', 4), false);

  const storage = memoryStorage();
  saveGame(saveState({
    version: 1,
    events: [
      ...lifecycle.snapshot().events,
      { kind: 'regional-flight-memory', id: 'region-x', regionId: 'region-x', memoryClass: 'unknown', occurredAt: 5 },
    ],
  }), storage);
  const restored = loadGame(storage);
  assert.equal(restored.exploration.events.length, 1);
  assert.equal(restored.exploration.events[0].regionId, 'region-b');
  assert.equal(Object.hasOwn(restored.exploration.events[0], 'coordinates'), false);
});

test('distinct known regions retain at most one bounded memory apiece', () => {
  const lifecycle = createExplorationLifecycle();
  assert.equal(lifecycle.recordRegionalFlightMemory('region-a', 'weathering', 10), true);
  assert.equal(lifecycle.recordRegionalFlightMemory('region-b', 'ring', 20), true);
  assert.equal(lifecycle.recordRegionalFlightMemory('region-b', 'hush', 30), false);
  const memories = collectRegionalFlightMemories(lifecycle.snapshot());
  assert.equal(memories.size, 2);
  assert.deepEqual(memories.get('region-a'), { regionId: 'region-a', memoryClass: 'weathering' });
  assert.deepEqual(memories.get('region-b'), { regionId: 'region-b', memoryClass: 'ring' });
});
