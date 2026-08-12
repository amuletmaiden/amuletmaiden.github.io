import assert from 'node:assert/strict';
import {
  profileStreamedLandingShelfVertices,
  streamedIslandLandingShelfInternals,
} from '../src/core/streamed-island-landing-shelf.js';

const island = Object.freeze({
  x: 100,
  z: -50,
  scale: 2,
  height: 200,
  landingZones: Object.freeze([
    Object.freeze({ x: 120, y: 16, z: -50, radius: 40 }),
  ]),
});

const local = streamedIslandLandingShelfInternals.localShelfZones(island);
assert.equal(local.length, 1);
assert.deepEqual(local[0], { x: 10, y: 0.08, z: 0, radius: 20 });

const core = new Float32Array([
  10, -0.25, 0,
  15, -0.1, 0,
  30, -0.3, 0,
]);
const coreResult = profileStreamedLandingShelfVertices(core, island);
assert.ok(Math.abs(coreResult[1] - 0.08) < 1e-6, 'shelf center must resolve to authored local height');
assert.ok(Math.abs(coreResult[4] - 0.08) < 1e-6, 'inner 55% core must read flat');
assert.equal(coreResult[7], core[7], 'outside shelf radius must preserve geology height exactly');

const transitionPoint = 10 + 20 * 0.775;
const transition = new Float32Array([transitionPoint, -0.32, 0]);
const transitionResult = profileStreamedLandingShelfVertices(transition, island);
assert.ok(transitionResult[1] > transition[1] && transitionResult[1] < 0.08,
  'outer shelf band must blend smoothly between geology and authored shelf height');

const bottom = new Float32Array([10, -0.92, 0]);
const bottomResult = profileStreamedLandingShelfVertices(bottom, island);
assert.equal(bottomResult[1], -0.92, 'underside/bottom-cap vertices must not be pulled up into the shelf');

const raisedIsland = {
  ...island,
  landingZones: [{ x: 120, y: 36, z: -50, radius: 40 }],
};
const raised = profileStreamedLandingShelfVertices(new Float32Array([10, -0.2, 0]), raisedIsland);
assert.ok(Math.abs(raised[1] - 0.18) < 1e-6, 'raised authored shelf must convert through island height scale');

const cutIsland = {
  ...island,
  landingZones: [{ x: 120, y: -10, z: -50, radius: 40 }],
};
const cut = profileStreamedLandingShelfVertices(new Float32Array([10, 0.08, 0]), cutIsland);
assert.ok(Math.abs(cut[1] + 0.05) < 1e-6, 'cut shelf may lower eligible upper presentation vertices without overshoot');

const malformed = profileStreamedLandingShelfVertices(core, {
  ...island,
  landingZones: [{ x: Number.NaN, y: 16, z: -50, radius: 40 }],
});
assert.deepEqual([...malformed], [...core], 'malformed landing geometry must preserve exact geology profile');

const before = [...core];
profileStreamedLandingShelfVertices(core, island);
assert.deepEqual([...core], before, 'presentation profiling must not mutate caller vertices');
assert.deepEqual(island.landingZones[0], { x: 120, y: 16, z: -50, radius: 40 }, 'island metadata must remain immutable');

console.log('streamed island landing shelf presentation contract passed');
