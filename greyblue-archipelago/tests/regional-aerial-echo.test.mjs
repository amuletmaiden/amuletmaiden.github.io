import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionalAerialEchoPublicState,
  stepRegionalAerialEcho,
} from '../src/core/regional-aerial-echo.js';

function worldFixture() {
  return {
    islands: [
      { id: 'island-a', regionId: 'region-a', x: 100, z: 200, height: 90, landmarkRecord: { id: 'landmark-a', title: 'Known Bell' } },
      { id: 'island-b', regionId: 'region-a', x: 800, z: -200, height: 130, landmarkRecord: { id: 'landmark-b', title: 'Known Lens' } },
      { id: 'island-hidden', regionId: 'region-a', x: 9000, z: 9000, height: 500, landmarkRecord: { id: 'landmark-hidden', title: 'Hidden' } },
      { id: 'island-other', regionId: 'region-b', x: -600, z: 700, height: 110, landmarkRecord: { id: 'landmark-other', title: 'Elsewhere' } },
    ],
  };
}

const known = Object.freeze({
  discoveredIslandIds: ['island-a', 'island-b'],
  investigatedLandmarkIds: ['landmark-a', 'landmark-b'],
});

function base(overrides = {}) {
  return {
    world: worldFixture(),
    currentRegionId: 'region-a',
    remembered: true,
    memoryClass: 'wake',
    ...known,
    position: { x: 0, y: 250, z: 0 },
    ...overrides,
  };
}

test('remembered known region is available but requires explicit listening to spawn', () => {
  const passive = stepRegionalAerialEcho(base());
  assert.deepEqual(regionalAerialEchoPublicState(passive), {
    available: true,
    active: false,
    completed: false,
    echoClass: null,
  });
  assert.equal(passive.echo, null);

  const spawned = stepRegionalAerialEcho(base({ listenRequested: true }));
  assert.equal(spawned.active, true);
  assert.equal(spawned.echo.echoClass, 'wake');
  assert.equal(['island-a', 'island-b'].includes(spawned.echo.hostIslandId), true);
  assert.equal(['landmark-a', 'landmark-b'].includes(spawned.echo.hostLandmarkId), true);
});

test('host choice is deterministic and hidden or uninvestigated content cannot enter selection', () => {
  const first = stepRegionalAerialEcho(base({ listenRequested: true }));
  const second = stepRegionalAerialEcho(base({ listenRequested: true }));
  assert.deepEqual(first.echo, second.echo);
  assert.notEqual(first.echo.hostIslandId, 'island-hidden');
  assert.notEqual(first.echo.hostLandmarkId, 'landmark-hidden');

  const withHiddenEvidence = stepRegionalAerialEcho(base({
    listenRequested: true,
    discoveredIslandIds: [...known.discoveredIslandIds, 'island-hidden'],
    investigatedLandmarkIds: known.investigatedLandmarkIds,
  }));
  assert.deepEqual(withHiddenEvidence.echo, first.echo);
});

test('echo placement stays bounded above an already-known host', () => {
  const spawned = stepRegionalAerialEcho(base({ listenRequested: true }));
  const host = worldFixture().islands.find((island) => island.id === spawned.echo.hostIslandId);
  assert.equal(spawned.echo.x, host.x);
  assert.equal(spawned.echo.z, host.z);
  assert.equal(spawned.echo.y >= 150 && spawned.echo.y <= 620, true);
  assert.equal(spawned.echo.y > host.height, true);
  assert.equal(spawned.echo.radius, 92);
});

test('truthful three-dimensional fly-through completes while near misses do not', () => {
  const spawned = stepRegionalAerialEcho(base({ listenRequested: true }));
  const echo = spawned.echo;
  const continuing = stepRegionalAerialEcho(base({
    state: spawned,
    position: { x: echo.x + echo.radius + 1, y: echo.y, z: echo.z },
  }));
  assert.equal(continuing.active, true);
  assert.equal(continuing.completed, false);

  const completed = stepRegionalAerialEcho(base({
    state: spawned,
    position: { x: echo.x + 20, y: echo.y - 10, z: echo.z + 15 },
  }));
  assert.deepEqual(regionalAerialEchoPublicState(completed), {
    available: true,
    active: false,
    completed: true,
    echoClass: 'wake',
  });
});

test('recovery, crossing, restore publication and localized interactions cancel safely', () => {
  const spawned = stepRegionalAerialEcho(base({ listenRequested: true }));
  for (const flag of ['recoveryActive', 'crossingActive', 'restorePublishing', 'localizedInteractionActive']) {
    const result = stepRegionalAerialEcho(base({ state: spawned, [flag]: true }));
    assert.equal(result.active, false, flag);
    assert.equal(result.completed, false, flag);
  }
});

test('wrong region, absent memory, invalid class and insufficient known evidence fail closed', () => {
  assert.equal(stepRegionalAerialEcho(base({ currentRegionId: 'region-b' })).available, false);
  assert.equal(stepRegionalAerialEcho(base({ remembered: false })).available, false);
  assert.equal(stepRegionalAerialEcho(base({ memoryClass: 'coordinates' })).available, false);
  assert.equal(stepRegionalAerialEcho(base({ discoveredIslandIds: [], investigatedLandmarkIds: [] })).available, false);
});

test('public state never exposes host identity or coordinates', () => {
  const spawned = stepRegionalAerialEcho(base({ listenRequested: true }));
  const publicState = regionalAerialEchoPublicState(spawned);
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'completed', 'echoClass']);
  assert.equal(JSON.stringify(publicState).includes('island-'), false);
  assert.equal(JSON.stringify(publicState).includes('landmark-'), false);
  assert.equal(JSON.stringify(publicState).includes('100'), false);
});

test('settings do not change model semantics and caller inputs stay immutable', () => {
  const world = worldFixture();
  const before = JSON.stringify(world);
  const baseline = stepRegionalAerialEcho(base({ world, listenRequested: true }));
  const presentationSettingsIgnoredByModel = stepRegionalAerialEcho(base({
    world,
    listenRequested: true,
    reducedMotion: true,
    mutedAudio: true,
  }));
  assert.deepEqual(presentationSettingsIgnoredByModel, baseline);
  assert.equal(JSON.stringify(world), before);
});
