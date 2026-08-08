import assert from 'node:assert/strict';
import { selectAwakenedLandmarkEcho, shouldPreferAwakenedEcho } from '../src/core/landmark-listening-echo.js';

const world = {
  islands: [
    {
      id: 'known-a',
      x: 0,
      z: 900,
      regionId: 'reach',
      landmarkRecord: { id: 'lm-a' },
    },
    {
      id: 'known-b',
      x: 700,
      z: 700,
      regionId: 'reach',
      landmarkRecord: { id: 'lm-b' },
    },
    {
      id: 'hidden',
      x: -300,
      z: 500,
      regionId: 'wake',
      landmarkRecord: { id: 'lm-hidden' },
    },
    {
      id: 'plain',
      x: 250,
      z: 250,
      regionId: 'reach',
    },
  ],
};

{
  const result = selectAwakenedLandmarkEcho({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discoveredIslandIds: ['known-a', 'known-b'],
    investigatedLandmarkIds: ['lm-a', 'lm-b'],
  });
  assert.equal(result.found, true);
  assert.equal(result.landmarkId, 'lm-a');
  assert.equal(result.turn, 'ahead');
  assert.equal(result.distanceBand, 'through the mist');
  assert.equal(result.soundHook, 'landmark-resonance-echo');
}

{
  const concealed = selectAwakenedLandmarkEcho({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discoveredIslandIds: ['known-a', 'known-b'],
    investigatedLandmarkIds: ['lm-hidden'],
  });
  assert.equal(concealed.found, false);
  assert.equal('landmarkId' in concealed, false);
}

{
  const uninvestigated = selectAwakenedLandmarkEcho({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discoveredIslandIds: ['known-a'],
    investigatedLandmarkIds: [],
  });
  assert.equal(uninvestigated.found, false);
}

{
  const right = selectAwakenedLandmarkEcho({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discoveredIslandIds: ['known-b'],
    investigatedLandmarkIds: ['lm-b'],
  });
  assert.equal(right.turn, 'right');
  assert.equal(right.distance, 990);
}

{
  const stableWorld = {
    islands: [
      { id: 'z-island', x: 100, z: 1000, landmarkRecord: { id: 'z-landmark' } },
      { id: 'a-island', x: -100, z: 1000, landmarkRecord: { id: 'a-landmark' } },
    ],
  };
  const result = selectAwakenedLandmarkEcho({
    world: stableWorld,
    position: { x: 0, z: 0 },
    yaw: 0,
    discoveredIslandIds: ['z-island', 'a-island'],
    investigatedLandmarkIds: ['z-landmark', 'a-landmark'],
  });
  assert.equal(result.landmarkId, 'a-landmark');
}

{
  const source = JSON.parse(JSON.stringify(world));
  const before = JSON.stringify(source);
  const result = selectAwakenedLandmarkEcho({
    world: source,
    position: { x: Number.NaN, z: undefined },
    yaw: Infinity,
    discoveredIslandIds: ['known-a'],
    investigatedLandmarkIds: new Set(['lm-a']),
    maxRange: Number.NaN,
  });
  assert.equal(result.found, true);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result), true);
}

{
  assert.equal(shouldPreferAwakenedEcho({ found: true, distance: 700 }, { found: false }), true);
  assert.equal(shouldPreferAwakenedEcho({ found: true, distance: 700 }, { found: true, distance: 1000 }), true);
  assert.equal(shouldPreferAwakenedEcho({ found: true, distance: 800 }, { found: true, distance: 1000 }), false);
  assert.equal(shouldPreferAwakenedEcho({ found: false }, { found: false }), false);
}

console.log('landmark-listening-echo: ok');
