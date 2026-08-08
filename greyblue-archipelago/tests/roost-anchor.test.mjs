import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRoostEvent, recoverLatestRoost, stepRoostDwell } from '../src/core/roost-anchor.js';

const island = { id: 'isle-a', landingZones: [{ id: 'isle-a:landing-0', x: 10, y: 12, z: 20, radius: 30, heading: 1.5 }] };
const frame = (overrides = {}) => ({ grounded: true, island, landingZone: island.landingZones[0], discoveredIslandIds: ['isle-a'], position: { x: 12, z: 22 }, dt: 1, ...overrides });

test('requires grounded dwell inside a discovered landing shelf', () => {
  let state = stepRoostDwell(null, frame(), 3);
  state = stepRoostDwell(state, frame(), 3);
  assert.equal(state.established, false);
  state = stepRoostDwell(state, frame(), 3);
  assert.equal(state.established, true);
  assert.equal(state.zoneId, 'isle-a:landing-0');
});

test('airborne hidden or outside-zone frames reset progress', () => {
  const begun = stepRoostDwell(null, frame(), 3);
  assert.equal(stepRoostDwell(begun, frame({ grounded: false }), 3).seconds, 0);
  assert.equal(stepRoostDwell(begun, frame({ discoveredIslandIds: [] }), 3).seconds, 0);
  assert.equal(stepRoostDwell(begun, frame({ position: { x: 100, z: 100 } }), 3).seconds, 0);
});

test('established dwell produces a bounded identity event', () => {
  const dwell = stepRoostDwell({ islandId: 'isle-a', zoneId: 'isle-a:landing-0', seconds: 3 }, frame({ dt: 1 }), 3);
  assert.deepEqual(makeRoostEvent(dwell, 42), { kind: 'roost-established', id: 'isle-a:landing-0', islandId: 'isle-a', landingZoneId: 'isle-a:landing-0', occurredAt: 42 });
});

test('restored anchor derives position from current authored zone, never stored coordinates', () => {
  const result = recoverLatestRoost({ world: { islands: [island] }, discoveredIslandIds: ['isle-a'], exploration: { events: [{ kind: 'roost-established', id: 'isle-a:landing-0', islandId: 'isle-a', landingZoneId: 'isle-a:landing-0', occurredAt: 10, position: { x: 9999, y: 9999, z: 9999 } }] } });
  assert.deepEqual(result.position, { x: 10, y: 18, z: 20 });
  assert.equal(result.heading, 1.5);
});

test('latest valid discovered authored roost wins; malformed and hidden anchors fail closed', () => {
  const islandB = { id: 'isle-b', landingZones: [{ id: 'isle-b:landing-0', x: 30, y: 8, z: 40, radius: 20, heading: 0 }] };
  const exploration = { events: [
    { kind: 'roost-established', id: 'bad', islandId: 'isle-a', landingZoneId: 'missing', occurredAt: 99 },
    { kind: 'roost-established', id: 'isle-b:landing-0', islandId: 'isle-b', landingZoneId: 'isle-b:landing-0', occurredAt: 50 },
    { kind: 'roost-established', id: 'isle-a:landing-0', islandId: 'isle-a', landingZoneId: 'isle-a:landing-0', occurredAt: 20 },
  ] };
  const result = recoverLatestRoost({ world: { islands: [island, islandB] }, discoveredIslandIds: ['isle-a'], exploration });
  assert.equal(result.islandId, 'isle-a');
  assert.equal(recoverLatestRoost({ world: { islands: [islandB] }, discoveredIslandIds: [], exploration }), null);
});