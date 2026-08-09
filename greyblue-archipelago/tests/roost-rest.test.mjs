import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRoostRest, roostRestPublicState } from '../src/core/roost-rest.js';

const earnedRoost = Object.freeze({ islandId: 'isle-a', zoneId: 'isle-a:landing-0', position: { x: 99, y: 4, z: -20 } });
const atRoost = Object.freeze({
  earnedRoost,
  grounded: true,
  groundedIslandId: 'isle-a',
  groundedZoneId: 'isle-a:landing-0',
});

test('rest requires truthful grounded identity at the earned roost', () => {
  assert.equal(deriveRoostRest({ ...atRoost, enterRest: true }).resting, true);
  assert.equal(deriveRoostRest({ ...atRoost, grounded: false, enterRest: true }).available, false);
  assert.equal(deriveRoostRest({ ...atRoost, groundedZoneId: 'other', enterRest: true }).resting, false);
  assert.equal(deriveRoostRest({ ...atRoost, recoveryActive: true, enterRest: true }).resting, false);
});

test('ordinary movement and crossing activity exit rest immediately', () => {
  assert.equal(deriveRoostRest({ ...atRoost, resting: true, movementActive: true }).resting, false);
  assert.equal(deriveRoostRest({ ...atRoost, resting: true, crossingActive: true }).resting, false);
});

test('departure reminder exposes only the known expedition purpose class', () => {
  const secretExpedition = Object.freeze({ active: true, purpose: 'landmark', routeId: 'known-route', destinationIslandId: 'known-isle', hiddenRoutePlan: ['secret'], coordinates: { x: 7 } });
  const state = deriveRoostRest({ ...atRoost, enterRest: true, expedition: secretExpedition });
  assert.deepEqual(state.departure, { purpose: 'landmark' });
  assert.deepEqual(roostRestPublicState(state), { available: true, resting: true, atmosphere: 'warmth', departureClass: 'landmark' });
  assert.equal(JSON.stringify(roostRestPublicState(state)).includes('secret'), false);
});

test('malformed or stale anchors fail closed and caller inputs remain untouched', () => {
  const input = { earnedRoost: { islandId: 'isle-a', zoneId: '', secret: 'nope' }, grounded: true, groundedIslandId: 'isle-a', groundedZoneId: 'x', enterRest: true };
  const before = JSON.stringify(input);
  assert.equal(deriveRoostRest(input).available, false);
  assert.equal(JSON.stringify(input), before);
});

test('reduced motion preserves rest semantics without changing progression', () => {
  const normal = deriveRoostRest({ ...atRoost, enterRest: true, reducedMotion: false, expedition: { active: true, purpose: 'frontier' } });
  const reduced = deriveRoostRest({ ...atRoost, enterRest: true, reducedMotion: true, expedition: { active: true, purpose: 'frontier' } });
  assert.equal(normal.resting, reduced.resting);
  assert.deepEqual(normal.departure, reduced.departure);
  assert.equal(reduced.reducedMotion, true);
});
