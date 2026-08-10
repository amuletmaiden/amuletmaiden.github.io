import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDiscoveredIslandSurvey,
  createDiscoveredIslandSurveyState,
  discoveredIslandSurveyPublicState,
} from '../src/core/discovered-island-survey.js';

const island = Object.freeze({ id: 'known-a', regionId: 'reach', x: 0, z: 0, radius: 180 });

function frame(patch = {}) {
  return {
    island,
    discoveredIslandIds: ['known-a'],
    currentRegionId: 'reach',
    position: { x: 500, z: 0 },
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    ...patch,
  };
}

function point(degrees, radius = 500) {
  const radians = degrees * Math.PI / 180;
  return { x: Math.cos(radians) * radius, z: Math.sin(radians) * radius };
}

function fly(points) {
  let state = createDiscoveredIslandSurveyState();
  for (const position of points) state = advanceDiscoveredIslandSurvey(state, frame({ position }));
  return state;
}

test('requires an already-discovered island in the current region', () => {
  assert.equal(advanceDiscoveredIslandSurvey(createDiscoveredIslandSurveyState(), frame({ discoveredIslandIds: [] })).active, false);
  assert.equal(advanceDiscoveredIslandSurvey(createDiscoveredIslandSurveyState(), frame({ currentRegionId: 'crown' })).active, false);
  assert.equal(advanceDiscoveredIslandSurvey(createDiscoveredIslandSurveyState(), frame()).active, true);
});

test('meaningful fly-around coverage completes clockwise and counter-clockwise', () => {
  const clockwise = fly([0, 40, 80, 120, 160, 200, 240, 280, 320, 350].map(point));
  const counter = fly([350, 310, 270, 230, 190, 150, 110, 70, 30, 0].map(point));
  assert.equal(clockwise.completed, true);
  assert.equal(counter.completed, true);
});

test('hover, local jitter and center cutting cannot manufacture completion', () => {
  let hover = createDiscoveredIslandSurveyState();
  for (let index = 0; index < 30; index += 1) hover = advanceDiscoveredIslandSurvey(hover, frame({ position: { x: 500 + (index % 2), z: 0 } }));
  assert.equal(hover.completed, false);

  const centerCut = fly([{ x: 500, z: 0 }, { x: 0, z: 0 }, { x: -500, z: 0 }]);
  assert.equal(centerCut.completed, false);
});

test('switching islands or interruption resets incomplete progress', () => {
  let state = fly([0, 45, 90].map(point));
  const other = Object.freeze({ id: 'known-b', regionId: 'reach', x: 1200, z: 0, radius: 180 });
  state = advanceDiscoveredIslandSurvey(state, frame({ island: other, discoveredIslandIds: ['known-a', 'known-b'], position: { x: 1700, z: 0 } }));
  assert.equal(state.islandId, 'known-b');
  assert.equal(state.pathTravel, 0);

  for (const patch of [{ paused: true }, { airborne: false }, { recoveryActive: true }, { restorePublishing: true }, { crossingActive: true }]) {
    const reset = advanceDiscoveredIslandSurvey(fly([0, 45, 90].map(point)), frame(patch));
    assert.equal(reset.active, false);
    assert.equal(reset.completed, false);
  }
});

test('public state strips island identity and survey geometry', () => {
  const state = fly([0, 45, 90].map(point));
  assert.deepEqual(discoveredIslandSurveyPublicState(state), { available: true, active: true, phase: 'acquire', completed: false });
  assert.deepEqual(Object.keys(discoveredIslandSurveyPublicState(state)), ['available', 'active', 'phase', 'completed']);
});

test('caller inputs remain unchanged', () => {
  const input = frame();
  const before = structuredClone(input);
  advanceDiscoveredIslandSurvey(createDiscoveredIslandSurveyState(), input);
  assert.deepEqual(input, before);
  assert.equal(island.x, 0);
});
