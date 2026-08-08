import assert from 'node:assert/strict';
import test from 'node:test';
import { createExplorationLifecycle } from '../src/core/exploration-lifecycle.js';
import { clearSave, loadGame, safeRespawn, saveGame } from '../src/core/save.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('exploration lifecycle keeps one newest earned roost while preserving other progress', () => {
  const lifecycle = createExplorationLifecycle({
    events: [{ kind: 'region-entered', id: 'r1', regionId: 'r1', occurredAt: 1 }],
  });
  assert.equal(lifecycle.recordRoost('isle-a', 'zone-a', 10), true);
  assert.equal(lifecycle.recordRoost('isle-a', 'zone-a', 11), false);
  assert.equal(lifecycle.recordRoost('isle-b', 'zone-b', 12), true);
  const snapshot = lifecycle.snapshot();
  assert.equal(snapshot.events.filter((event) => event.kind === 'roost-established').length, 1);
  assert.equal(snapshot.events.find((event) => event.kind === 'roost-established').islandId, 'isle-b');
  assert.ok(snapshot.events.some((event) => event.kind === 'region-entered'));
  assert.equal(lifecycle.telemetry().roostCount, 1);
});

test('save normalization preserves stable roost identity but not arbitrary coordinate fields', () => {
  const storage = memoryStorage();
  const saved = saveGame({
    seed: 7,
    position: { x: 1, y: 160, z: 2 },
    discovered: ['isle-a'],
    discoveredRoutes: [],
    exploration: {
      events: [{
        kind: 'roost-established',
        id: 'zone-a',
        islandId: 'isle-a',
        landingZoneId: 'zone-a',
        occurredAt: 25,
        position: { x: 9999, y: 9999, z: 9999 },
      }],
    },
  }, storage);
  const roost = saved.exploration.events[0];
  assert.deepEqual(roost, {
    key: 'roost-established:zone-a',
    kind: 'roost-established',
    id: 'zone-a',
    occurredAt: 25,
    islandId: 'isle-a',
    landingZoneId: 'zone-a',
  });
  assert.deepEqual(loadGame(storage).exploration.events[0], roost);
  clearSave(storage);
});

test('safe respawn consumes only the already validated earned-roost handoff', () => {
  const previous = globalThis.__greyblueRoostRecovery;
  globalThis.__greyblueRoostRecovery = Object.freeze({
    source: 'earned-roost',
    islandId: 'isle-a',
    zoneId: 'zone-a',
    position: Object.freeze({ x: 40, y: 26, z: -12 }),
    heading: 1.25,
  });
  try {
    const recovered = safeRespawn({ position: { x: 0, y: 160, z: 0 } }, { x: 0, y: 160, z: 0 });
    assert.deepEqual(recovered.position, { x: 40, y: 26, z: -12 });
    assert.equal(recovered.recoverySource, 'earned-roost');
    assert.equal(recovered.recoveryHeading, 1.25);
    assert.deepEqual(recovered.velocity, { x: 0, y: 0, z: 0 });
    assert.equal(recovered.airborne, true);
  } finally {
    if (previous === undefined) delete globalThis.__greyblueRoostRecovery;
    else globalThis.__greyblueRoostRecovery = previous;
  }
});

test('safe respawn rejects malformed global roost coordinates', () => {
  const previous = globalThis.__greyblueRoostRecovery;
  globalThis.__greyblueRoostRecovery = {
    source: 'earned-roost',
    position: { x: Number.NaN, y: 20, z: 3 },
  };
  try {
    const recovered = safeRespawn({ position: { x: 0, y: 160, z: 0 } }, { x: 3, y: 170, z: 4 });
    assert.notEqual(recovered.recoverySource, 'earned-roost');
    assert.ok(Number.isFinite(recovered.position.x));
    assert.ok(Number.isFinite(recovered.position.y));
    assert.ok(Number.isFinite(recovered.position.z));
  } finally {
    if (previous === undefined) delete globalThis.__greyblueRoostRecovery;
    else globalThis.__greyblueRoostRecovery = previous;
  }
});
