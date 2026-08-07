import assert from 'node:assert/strict';
import { selectListeningSignal } from '../src/core/listening-pulse-model.js';

const world = {
  islands: [
    { id: 'known', x: 0, z: 700, regionId: 'reach', landmark: false },
    { id: 'plain', x: 0, z: 1200, regionId: 'reach', landmark: false },
    { id: 'signal', x: 900, z: 1250, regionId: 'wake', landmark: true },
    { id: 'far', x: 0, z: 6000, regionId: 'choir', landmark: true },
  ],
};

{
  const result = selectListeningSignal({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discovered: ['known'],
  });
  assert.equal(result.found, true);
  assert.equal(result.islandId, 'plain');
  assert.equal(result.turn, 'ahead');
  assert.equal(result.distance, 1200);
}

{
  const result = selectListeningSignal({
    world: { islands: [{ id: 'landmark', x: 900, z: 900, landmark: true }] },
    position: { x: 0, z: 0 },
    yaw: 0,
    discovered: [],
  });
  assert.equal(result.found, true);
  assert.equal(result.landmarkSignal, true);
  assert.equal(result.turn, 'right');
  assert.ok(result.bearing > 0 && result.bearing < Math.PI);
}

{
  const result = selectListeningSignal({
    world,
    position: { x: 0, z: 0 },
    yaw: 0,
    discovered: ['known', 'plain', 'signal'],
    maxRange: 2500,
  });
  assert.deepEqual(result, {
    found: false,
    range: 2500,
    message: 'Only open mist answers.',
  });
}

{
  const malformed = selectListeningSignal({
    world: { islands: [{ id: 'bad', x: Number.NaN, z: Infinity }] },
    position: { x: Number.NaN, z: undefined },
    yaw: Infinity,
    discovered: null,
    maxRange: Number.NaN,
  });
  assert.equal(malformed.found, false);
  assert.equal(Number.isFinite(malformed.range), true);
  assert.doesNotThrow(() => JSON.stringify(malformed));
}

{
  const source = {
    islands: [{ id: 'still', x: -800, z: 800, regionId: 'reach', landmark: false }],
  };
  const before = JSON.stringify(source);
  const result = selectListeningSignal({ world: source, position: { x: 0, z: 0 }, yaw: 0, discovered: [] });
  assert.equal(result.turn, 'left');
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result), true);
}

console.log('listening-pulse-model: ok');
