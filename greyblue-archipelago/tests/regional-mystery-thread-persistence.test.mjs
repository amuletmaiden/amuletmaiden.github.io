import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationLifecycle } from '../src/core/exploration-lifecycle.js';
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
    discovered: ['island-a', 'island-b'],
    discoveredRoutes: [],
    guidance: null,
    exploration,
    settings: {},
  };
}

test('regional thread recognition is canonical, idempotent, and survives save/load', () => {
  const lifecycle = createExplorationLifecycle();
  assert.equal(lifecycle.recordRegionalThreadRecognition('region-a', 1234), true);
  assert.equal(lifecycle.recordRegionalThreadRecognition('region-a', 9999), false);

  const snapshot = lifecycle.snapshot();
  assert.deepEqual(snapshot.events, [{
    key: 'regional-thread-recognized:region-a',
    kind: 'regional-thread-recognized',
    id: 'region-a',
    occurredAt: 1234,
    regionId: 'region-a',
  }]);
  assert.equal(lifecycle.telemetry().regionalThreadRecognitionCount, 1);

  const storage = memoryStorage();
  saveGame(saveState(snapshot), storage);
  const restored = loadGame(storage);
  assert.equal(restored.exploration.events.length, 1);
  assert.equal(restored.exploration.events[0].kind, 'regional-thread-recognized');
  assert.equal(restored.exploration.events[0].regionId, 'region-a');

  const restoredLifecycle = createExplorationLifecycle(restored.exploration);
  assert.equal(restoredLifecycle.recordRegionalThreadRecognition('region-a', 5555), false);
  assert.equal(restoredLifecycle.telemetry().regionalThreadRecognitionCount, 1);
});

test('malformed regional recognition does not enter the canonical ledger', () => {
  const lifecycle = createExplorationLifecycle({
    events: [
      { kind: 'regional-thread-recognized', id: '', regionId: 'region-a', occurredAt: 1 },
      { kind: 'regional-thread-recognized', id: 'region-b', regionId: '', occurredAt: 2 },
      { kind: 'not-a-real-kind', id: 'region-c', regionId: 'region-c', occurredAt: 3 },
    ],
  });
  assert.equal(lifecycle.telemetry().regionalThreadRecognitionCount, 1);
  assert.equal(lifecycle.snapshot().events[0].id, 'region-b');
  assert.equal(lifecycle.recordRegionalThreadRecognition('   ', 4), false);
});
