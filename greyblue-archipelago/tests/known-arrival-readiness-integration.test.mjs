import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveKnownArrivalReadinessFrame } from '../src/core/known-arrival-readiness-integration.js';
import {
  cancelKnownVoyageIntention,
  createKnownVoyageIntentionState,
  getPrivateKnownVoyageTarget,
  publicKnownVoyageIntention,
  selectKnownVoyageIntention,
} from '../src/core/known-voyage-intention.js';

const island = Object.freeze({ id: 'known-a', regionId: 'region-a', scale: 1.4, height: 80 });
const world = Object.freeze({ islands: Object.freeze([island]) });
const voyage = Object.freeze({ active: true, phase: 'underway', completed: false, text: '' });

function state(overrides = {}) {
  return {
    ready: true,
    paused: false,
    position: { x: 0, y: 80, z: 0 },
    discovered: ['known-a'],
    activeIslandIds: ['known-a'],
    currentRegion: { id: 'region-a' },
    nearestIsland: { id: 'known-a', regionId: 'region-a', distance: 90 },
    surface: { height: 18, surface: 'terrain', id: 'known-a' },
    collision: { requiresRecovery: false },
    flight: { mode: 'flight' },
    routeChoice: { reason: 'ordinary' },
    ...overrides,
  };
}

const target = Object.freeze({ id: 'known-a', regionId: 'region-a' });

function derive(overrides = {}) {
  return deriveKnownArrivalReadinessFrame({
    state: state(overrides.state),
    voyage: overrides.voyage ?? voyage,
    target: overrides.target ?? target,
    world,
    crossing: overrides.crossing ?? false,
    isResident: overrides.isResident ?? (() => true),
  });
}

test('resident known target with canonical terrain stays silent', () => {
  assert.deepEqual(derive(), { active: false, state: null });
});

test('requested known target in the final island envelope reports loading until resident', () => {
  assert.deepEqual(derive({ isResident: () => false }), { active: true, state: 'loading' });
});

test('resident target with water or missing surface truth reports degraded', () => {
  assert.deepEqual(derive({ state: { surface: { height: 0, surface: 'water', id: 'greyblue-ocean' } } }), {
    active: true,
    state: 'degraded',
  });
  assert.deepEqual(derive({ state: { surface: { height: Number.NaN, surface: 'terrain', id: 'known-a' } } }), {
    active: true,
    state: 'degraded',
  });
});

test('unknown wrong-region wrong-nearest and outside-envelope space never publishes readiness', () => {
  assert.deepEqual(derive({ state: { discovered: [] }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ state: { currentRegion: { id: 'region-b' } }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ state: { nearestIsland: { id: 'other', distance: 20 } }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ state: { nearestIsland: { id: 'known-a', distance: 999 } }, isResident: () => false }), { active: false, state: null });
});

test('missing baseline request stays loading rather than pretending residency is enough', () => {
  assert.deepEqual(derive({ state: { activeIslandIds: [] } }), { active: true, state: 'loading' });
});

test('pause recovery restore and crossing clear the arrival surface', () => {
  assert.deepEqual(derive({ state: { paused: true }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ state: { collision: { requiresRecovery: true } }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ state: { restorePublishing: true }, isResident: () => false }), { active: false, state: null });
  assert.deepEqual(derive({ crossing: true, isResident: () => false }), { active: false, state: null });
});

test('private voyage target follows selection/publication and clears on cancel without changing public shape', () => {
  cancelKnownVoyageIntention();
  const selected = selectKnownVoyageIntention({
    state: createKnownVoyageIntentionState(),
    candidate: { id: 'known-a', regionId: 'region-a' },
    knownNodes: [{ id: 'known-a', name: 'Known A', regionId: 'region-a' }],
  });
  const projected = publicKnownVoyageIntention(selected);
  assert.deepEqual(projected, {
    active: true,
    phase: 'depart',
    completed: false,
    text: 'Take wing when you are ready.',
  });
  assert.deepEqual(Object.keys(projected), ['active', 'phase', 'completed', 'text']);
  assert.deepEqual(getPrivateKnownVoyageTarget(), { id: 'known-a', regionId: 'region-a' });
  cancelKnownVoyageIntention();
  assert.equal(getPrivateKnownVoyageTarget(), null);
});

test('integration does not mutate caller-owned world or runtime records', () => {
  const mutableState = state();
  const mutableWorld = { islands: [{ ...island }] };
  const beforeState = structuredClone(mutableState);
  const beforeWorld = structuredClone(mutableWorld);
  deriveKnownArrivalReadinessFrame({
    state: mutableState,
    voyage,
    target,
    world: mutableWorld,
    isResident: () => true,
  });
  assert.deepEqual(mutableState, beforeState);
  assert.deepEqual(mutableWorld, beforeWorld);
});
