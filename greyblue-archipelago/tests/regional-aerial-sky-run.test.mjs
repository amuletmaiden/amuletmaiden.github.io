import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionalAerialSkyRunPublicState,
  stepRegionalAerialSkyRun,
} from '../src/core/regional-aerial-sky-run.js';

function worldFixture() {
  return {
    islands: [
      { id: 'island-a', regionId: 'region-a', x: 100, z: 150, height: 90, landmarkRecord: { id: 'landmark-a' } },
      { id: 'island-b', regionId: 'region-a', x: 700, z: -250, height: 120, landmarkRecord: { id: 'landmark-b' } },
      { id: 'island-c', regionId: 'region-a', x: -500, z: 800, height: 145, landmarkRecord: { id: 'landmark-c' } },
      { id: 'island-d', regionId: 'region-a', x: 1100, z: 950, height: 170, landmarkRecord: { id: 'landmark-d' } },
      { id: 'island-hidden', regionId: 'region-a', x: 9200, z: 9100, height: 500, landmarkRecord: { id: 'landmark-hidden' } },
      { id: 'island-other', regionId: 'region-b', x: -900, z: -900, height: 100, landmarkRecord: { id: 'landmark-other' } },
    ],
  };
}

const known = Object.freeze({
  discoveredIslandIds: ['island-a', 'island-b', 'island-c', 'island-d'],
  investigatedLandmarkIds: ['landmark-a', 'landmark-b', 'landmark-c', 'landmark-d'],
});

function base(overrides = {}) {
  return {
    world: worldFixture(),
    currentRegionId: 'region-a',
    remembered: true,
    memoryClass: 'ring',
    ...known,
    position: { x: 0, y: 300, z: 0 },
    ...overrides,
  };
}

test('known remembered region is available but sky run requires explicit start', () => {
  const passive = stepRegionalAerialSkyRun(base());
  assert.deepEqual(regionalAerialSkyRunPublicState(passive), {
    available: true,
    active: false,
    phase: null,
    echoClass: null,
    completed: false,
  });

  const started = stepRegionalAerialSkyRun(base({ startRequested: true }));
  assert.equal(started.active, true);
  assert.equal(started.phase, 'first');
  assert.equal(started.plan.length, 3);
  assert.equal(new Set(started.plan.map((echo) => echo.hostLandmarkId)).size, 3);
});

test('three-host ordering is deterministic and excludes hidden or uninvestigated content before ordering', () => {
  const first = stepRegionalAerialSkyRun(base({ startRequested: true }));
  const second = stepRegionalAerialSkyRun(base({ startRequested: true }));
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.plan.some((echo) => echo.hostLandmarkId === 'landmark-hidden'), false);

  const hiddenDiscoveredButNotInvestigated = stepRegionalAerialSkyRun(base({
    startRequested: true,
    discoveredIslandIds: [...known.discoveredIslandIds, 'island-hidden'],
  }));
  assert.deepEqual(hiddenDiscoveredButNotInvestigated.plan, first.plan);
});

test('each echo placement is bounded above a distinct already-known host', () => {
  const started = stepRegionalAerialSkyRun(base({ startRequested: true }));
  const world = worldFixture();
  for (const echo of started.plan) {
    const host = world.islands.find((island) => island.id === echo.hostIslandId);
    assert.ok(host);
    assert.equal(echo.x, host.x);
    assert.equal(echo.z, host.z);
    assert.equal(echo.y > host.height, true);
    assert.equal(echo.y >= 165 && echo.y <= 640, true);
    assert.equal(echo.radius, 88);
  }
});

test('truthful sequential fly-through advances first to middle to final and then completes', () => {
  const first = stepRegionalAerialSkyRun(base({ startRequested: true }));
  const middle = stepRegionalAerialSkyRun(base({
    state: first,
    position: { x: first.echo.x, y: first.echo.y, z: first.echo.z },
  }));
  assert.equal(middle.active, true);
  assert.equal(middle.phase, 'middle');
  assert.notEqual(middle.echo.hostLandmarkId, first.echo.hostLandmarkId);

  const final = stepRegionalAerialSkyRun(base({
    state: middle,
    position: { x: middle.echo.x, y: middle.echo.y, z: middle.echo.z },
  }));
  assert.equal(final.active, true);
  assert.equal(final.phase, 'final');
  assert.equal(new Set([first.echo.hostLandmarkId, middle.echo.hostLandmarkId, final.echo.hostLandmarkId]).size, 3);

  const completed = stepRegionalAerialSkyRun(base({
    state: final,
    position: { x: final.echo.x, y: final.echo.y, z: final.echo.z },
  }));
  assert.deepEqual(regionalAerialSkyRunPublicState(completed), {
    available: true,
    active: false,
    phase: null,
    echoClass: 'ring',
    completed: true,
  });
});

test('near misses and being at a later echo cannot skip the current phase', () => {
  const first = stepRegionalAerialSkyRun(base({ startRequested: true }));
  const nearMiss = stepRegionalAerialSkyRun(base({
    state: first,
    position: { x: first.echo.x + first.echo.radius + 1, y: first.echo.y, z: first.echo.z },
  }));
  assert.equal(nearMiss.phase, 'first');

  const later = first.plan[2];
  const wrongOrder = stepRegionalAerialSkyRun(base({
    state: first,
    position: { x: later.x, y: later.y, z: later.z },
  }));
  assert.equal(wrongOrder.phase, 'first');
  assert.equal(wrongOrder.echo.hostLandmarkId, first.echo.hostLandmarkId);
});

test('recovery, crossing, restore and localized interactions cancel the run', () => {
  const started = stepRegionalAerialSkyRun(base({ startRequested: true }));
  for (const flag of ['recoveryActive', 'crossingActive', 'restorePublishing', 'localizedInteractionActive']) {
    const result = stepRegionalAerialSkyRun(base({ state: started, [flag]: true }));
    assert.equal(result.active, false, flag);
    assert.equal(result.completed, false, flag);
  }
});

test('wrong region, missing memory and fewer than three known hosts fail closed', () => {
  assert.equal(stepRegionalAerialSkyRun(base({ currentRegionId: 'region-b' })).available, false);
  assert.equal(stepRegionalAerialSkyRun(base({ remembered: false })).available, false);
  assert.equal(stepRegionalAerialSkyRun(base({ memoryClass: 'secret' })).available, false);
  assert.equal(stepRegionalAerialSkyRun(base({
    discoveredIslandIds: ['island-a', 'island-b'],
    investigatedLandmarkIds: ['landmark-a', 'landmark-b'],
  })).available, false);
});

test('session-completed state suppresses replay without persistence', () => {
  const result = stepRegionalAerialSkyRun(base({
    startRequested: true,
    sessionCompleted: true,
  }));
  assert.deepEqual(regionalAerialSkyRunPublicState(result), {
    available: true,
    active: false,
    phase: null,
    echoClass: 'ring',
    completed: true,
  });
});

test('public state is bounded and presentation settings cannot change model semantics', () => {
  const world = worldFixture();
  const before = JSON.stringify(world);
  const baseline = stepRegionalAerialSkyRun(base({ world, startRequested: true }));
  const settings = stepRegionalAerialSkyRun(base({
    world,
    startRequested: true,
    reducedMotion: true,
    mutedAudio: true,
  }));
  assert.deepEqual(settings, baseline);
  assert.equal(JSON.stringify(world), before);

  const publicState = regionalAerialSkyRunPublicState(baseline);
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'echoClass', 'phase']);
  const serialized = JSON.stringify(publicState);
  assert.equal(serialized.includes('landmark-'), false);
  assert.equal(serialized.includes('island-'), false);
  assert.equal(serialized.includes('100'), false);
});
