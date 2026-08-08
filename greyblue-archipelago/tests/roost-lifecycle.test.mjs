import assert from 'node:assert/strict';
import test from 'node:test';
import { appendRoostEvent, planRoostRecovery, stepEarnedRoost } from '../src/core/roost-lifecycle.js';

const zone = { id: 'isle-a:landing-0', x: 10, y: 12, z: 20, radius: 30, heading: 1.5 };
const island = { id: 'isle-a', landingZones: [zone] };
const frame = (dt = 1) => ({ dt, grounded: true, island, landingZone: zone, discoveredIslandIds: ['isle-a'], position: { x: 10, z: 20 } });

test('emits establishment once per uninterrupted established dwell', () => {
  let result = stepEarnedRoost({ frame: frame(), exploration: { events: [] }, occurredAt: 10, dwellSeconds: 2 });
  assert.equal(result.newlyEstablished, false);
  result = stepEarnedRoost({ dwell: result.dwell, frame: frame(), exploration: result.exploration, occurredAt: 11, dwellSeconds: 2 });
  assert.equal(result.newlyEstablished, true);
  assert.equal(result.exploration.events.length, 1);
  const held = stepEarnedRoost({ dwell: result.dwell, frame: frame(), exploration: result.exploration, occurredAt: 12, dwellSeconds: 2 });
  assert.equal(held.newlyEstablished, false);
  assert.equal(held.exploration.events.length, 1);
});

test('revisiting a roost replaces its prior event with the newest truthful establishment', () => {
  const older = { kind: 'roost-established', id: zone.id, islandId: island.id, landingZoneId: zone.id, occurredAt: 5 };
  const newer = { ...older, occurredAt: 20 };
  const result = appendRoostEvent({ events: [older, { kind: 'region-entered', id: 'r1', occurredAt: 1 }] }, newer);
  assert.equal(result.events.filter((event) => event.kind === 'roost-established').length, 1);
  assert.equal(result.events.at(-1).occurredAt, 20);
});

test('recovery prefers a validated earned roost and derives current authored coordinates', () => {
  const exploration = { events: [{ kind: 'roost-established', id: zone.id, islandId: island.id, landingZoneId: zone.id, occurredAt: 5, position: { x: 9999, y: 9999, z: 9999 } }] };
  const result = planRoostRecovery({ world: { islands: [island] }, exploration, discoveredIslandIds: ['isle-a'], fallback: { x: 0, y: 160, z: 0 } });
  assert.equal(result.source, 'earned-roost');
  assert.deepEqual(result.position, { x: 10, y: 18, z: 20 });
});

test('invalid or hidden restored roost falls back without trusting stored coordinates', () => {
  const exploration = { events: [{ kind: 'roost-established', id: zone.id, islandId: island.id, landingZoneId: zone.id, occurredAt: 5 }] };
  const result = planRoostRecovery({ world: { islands: [island] }, exploration, discoveredIslandIds: [], fallback: { x: 1, y: 160, z: 2 } });
  assert.equal(result.source, 'fallback');
  assert.deepEqual(result.position, { x: 1, y: 160, z: 2 });
});
