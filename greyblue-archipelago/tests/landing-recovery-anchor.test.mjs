import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/landing-recovery-anchor.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createLandingRecoveryAnchor } = await import(moduleUrl);

function makeHarness() {
  let stored = {
    seed: 1337,
    position: { x: 10, y: 160, z: 20 },
    recoveryCheckpoint: { x: 4, y: 150, z: 8 },
    discovered: ['isle-1'],
    discoveredRoutes: ['route:a'],
    exploration: { version: 1, events: [{ key: 'region-entered:r1', kind: 'region-entered', id: 'r1', occurredAt: 1 }] },
    settings: { cameraDistance: 28 },
  };
  const writes = [];
  return {
    loadGame: () => structuredClone(stored),
    saveGame: (state) => {
      const previousPosition = stored.position;
      stored = {
        ...structuredClone(state),
        recoveryCheckpoint: structuredClone(previousPosition),
      };
      writes.push(structuredClone(stored));
      return structuredClone(stored);
    },
    writes,
    get stored() { return structuredClone(stored); },
  };
}

function landed(overrides = {}) {
  return {
    ready: true,
    paused: false,
    seed: 1337,
    position: { x: 900, y: 42, z: -700 },
    flight: { airborne: false },
    collision: { grounded: true, requiresRecovery: false },
    discovered: ['isle-1', 'isle-9'],
    discoveredRoutes: ['route:a', 'route:b'],
    guidancePreference: 'route:b',
    routeGuidance: { progress: 0.72 },
    ...overrides,
  };
}

{
  const harness = makeHarness();
  const anchor = createLandingRecoveryAnchor({
    loadGame: harness.loadGame,
    saveGame: harness.saveGame,
    now: () => 444,
  });
  assert.equal(anchor.consume(landed()), true);
  assert.equal(harness.writes.length, 2, 'a deliberate landing performs the bounded checkpoint promotion pair');
  assert.deepEqual(harness.stored.position, { x: 900, y: 42, z: -700 });
  assert.deepEqual(harness.stored.recoveryCheckpoint, { x: 900, y: 42, z: -700 }, 'landing becomes the durable recovery anchor');
  assert.deepEqual(harness.stored.exploration.events.map((entry) => entry.id), ['r1'], 'existing exploration progress is preserved');
  assert.deepEqual(harness.stored.settings, { cameraDistance: 28 }, 'existing settings are preserved');
  assert.deepEqual(harness.stored.guidance, { activeRouteId: 'route:b', progress: 0.72 });
  assert.deepEqual(anchor.telemetry(), {
    anchorCount: 1,
    lastAnchorAt: 444,
    lastAnchorPosition: { x: 900, y: 42, z: -700 },
    error: null,
  });
  assert.equal(Object.isFrozen(anchor.telemetry()), true);
}

{
  const harness = makeHarness();
  const anchor = createLandingRecoveryAnchor({ loadGame: harness.loadGame, saveGame: harness.saveGame });
  assert.equal(anchor.consume(landed()), true);
  assert.equal(anchor.consume(landed({ position: { x: 901, y: 42, z: -700 } })), false, 'repeated grounded frames cannot churn storage');
  assert.equal(harness.writes.length, 2);
  assert.equal(anchor.consume(landed({ flight: { airborne: true }, collision: { grounded: false, requiresRecovery: false } })), false);
  assert.equal(anchor.consume(landed({ position: { x: 1200, y: 38, z: 600 } })), true, 'a later landing after flight creates a new anchor');
  assert.equal(harness.writes.length, 4);
  assert.deepEqual(harness.stored.recoveryCheckpoint, { x: 1200, y: 38, z: 600 });
}

{
  const harness = makeHarness();
  const anchor = createLandingRecoveryAnchor({ loadGame: harness.loadGame, saveGame: harness.saveGame });
  for (const state of [
    null,
    {},
    landed({ ready: false }),
    landed({ paused: true }),
    landed({ collision: { grounded: true, requiresRecovery: true } }),
    landed({ flight: { airborne: true } }),
    landed({ position: { x: Infinity, y: 20, z: 0 } }),
    landed({ position: { x: 25000, y: 20, z: 0 } }),
  ]) {
    assert.equal(anchor.consume(state), false);
  }
  assert.equal(harness.writes.length, 0, 'unsafe or malformed states never alter persistence');
}

{
  const anchor = createLandingRecoveryAnchor({
    loadGame: () => ({}),
    saveGame: () => { throw new Error('storage denied'); },
    now: () => 9,
  });
  assert.equal(anchor.consume(landed()), false, 'storage failure is contained');
  assert.equal(anchor.telemetry().anchorCount, 0);
  assert.equal(anchor.telemetry().error, 'storage denied');
}

assert.throws(() => createLandingRecoveryAnchor(), /requires loadGame and saveGame/);
console.log('landing recovery anchor tests passed');
