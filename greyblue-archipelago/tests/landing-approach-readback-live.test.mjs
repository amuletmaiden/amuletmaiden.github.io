import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveLiveLandingApproachReadback } from '../src/interface/landing-approach-readback-live.js';

function fixture() {
  return {
    ready: true,
    paused: false,
    position: { x: 0, y: 30, z: 20 },
    flight: { airborne: true, yaw: 0, velocity: { x: 0, y: -2, z: 20 }, mode: 'powered-flight' },
    collision: { grounded: false, requiresRecovery: false },
    discovered: ['isle-a'],
    currentRegion: { id: 'region-a' },
    nearestIsland: {
      id: 'isle-a',
      regionId: 'region-a',
      approachCorridors: [{
        entry: { x: 0, z: 0 },
        touchdown: { x: 0, z: 100 },
        width: 30,
        maximumDescentRate: 8,
      }],
    },
  };
}

test('publishes only qualitative readback for a discovered current-region corridor', () => {
  const state = fixture();
  const before = structuredClone(state);
  const result = deriveLiveLandingApproachReadback(state);
  assert.deepEqual(result, { active: true, alignment: 'lined', descent: 'steady' });
  assert.deepEqual(Object.keys(result).sort(), ['active', 'alignment', 'descent']);
  assert.deepEqual(state, before);
});

test('fails closed for hidden or wrong-region corridors', () => {
  const undiscovered = fixture();
  undiscovered.discovered = [];
  assert.equal(deriveLiveLandingApproachReadback(undiscovered).active, false);

  const wrongRegion = fixture();
  wrongRegion.currentRegion.id = 'region-b';
  assert.equal(deriveLiveLandingApproachReadback(wrongRegion).active, false);
});

test('fails closed during crossing, recovery, pause, restore, and grounding', () => {
  assert.equal(deriveLiveLandingApproachReadback(fixture(), { crossingActive: true }).active, false);

  const recovery = fixture();
  recovery.collision.requiresRecovery = true;
  assert.equal(deriveLiveLandingApproachReadback(recovery).active, false);

  const paused = fixture();
  paused.paused = true;
  assert.equal(deriveLiveLandingApproachReadback(paused).active, false);

  const restore = fixture();
  restore.restorePublishing = true;
  assert.equal(deriveLiveLandingApproachReadback(restore).active, false);

  const grounded = fixture();
  grounded.collision.grounded = true;
  assert.equal(deriveLiveLandingApproachReadback(grounded).active, false);
});

test('tries authored corridors without leaking their identity', () => {
  const state = fixture();
  state.nearestIsland.approachCorridors.unshift({
    entry: { x: 500, z: 500 },
    touchdown: { x: 500, z: 600 },
    width: 20,
    maximumDescentRate: 8,
    id: 'hidden-authoring-id',
  });
  const result = deriveLiveLandingApproachReadback(state);
  assert.equal(result.active, true);
  assert.equal(JSON.stringify(result).includes('hidden-authoring-id'), false);
});
