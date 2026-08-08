import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCompletedLandmarkFlightEncounter,
  stepLandmarkFlightEncounter,
} from '../src/core/landmark-flight-encounter.js';

const known = Object.freeze({
  id: 'bell-spire',
  islandId: 'isle-7',
  regionId: 'north-mist',
  x: 100,
  z: 0,
  radius: 80,
  encounterClass: 'hush',
  discovered: true,
  investigated: true,
});

function step(position, speed, state = null, extra = {}) {
  return stepLandmarkFlightEncounter({ landmarks: [known], position, speed, state, ...extra });
}

test('truthful outside-inside-outside traversal completes once it exits at flight speed', () => {
  const outside = step({ x: 0, z: 0 }, 40);
  assert.equal(outside.state.phase, 'armed');
  const inside = step({ x: 100, z: 0 }, 40, outside.state);
  assert.equal(inside.state.phase, 'inside');
  const exited = step({ x: 200, z: 0 }, 40, inside.state);
  assert.equal(exited.event.kind, 'landmark-flight-encounter');
  assert.equal(exited.event.landmarkId, 'bell-spire');
  assert.equal(exited.event.encounterClass, 'hush');
});

test('spawning inside does not count until the landmark has been approached from outside', () => {
  const spawned = step({ x: 100, z: 0 }, 40);
  assert.equal(spawned.state.phase, 'idle');
  const exit = step({ x: 200, z: 0 }, 40, spawned.state);
  assert.equal(exit.event, null);
  assert.equal(exit.state.phase, 'armed');
});

test('low-speed overlap does not arm completion', () => {
  const outside = step({ x: 0, z: 0 }, 40);
  const inside = step({ x: 100, z: 0 }, 4, outside.state);
  assert.notEqual(inside.state.phase, 'inside');
  assert.equal(step({ x: 200, z: 0 }, 40, inside.state).event, null);
});

test('recovery clears in-progress traversal', () => {
  const outside = step({ x: 0, z: 0 }, 40);
  const inside = step({ x: 100, z: 0 }, 40, outside.state);
  const recovered = step({ x: 100, z: 0 }, 40, inside.state, { recovered: true });
  assert.equal(recovered.state.phase, 'idle');
  assert.equal(recovered.state.landmarkId, '');
  assert.equal(recovered.event, null);
});

test('undiscovered or uninvestigated landmarks never become eligible', () => {
  for (const candidate of [
    { ...known, discovered: false },
    { ...known, investigated: false },
  ]) {
    const result = stepLandmarkFlightEncounter({ landmarks: [candidate], position: { x: 0, z: 0 }, speed: 40 });
    assert.equal(result.active, null);
    assert.equal(result.event, null);
  }
});

test('stable nearest ordering does not depend on caller landmark order', () => {
  const other = { ...known, id: 'amber-arch', islandId: 'isle-8', x: -100 };
  const forward = stepLandmarkFlightEncounter({ landmarks: [known, other], position: { x: 0, z: 0 }, speed: 40 });
  const reverse = stepLandmarkFlightEncounter({ landmarks: [other, known], position: { x: 0, z: 0 }, speed: 40 });
  assert.equal(forward.active.landmarkId, reverse.active.landmarkId);
  assert.equal(forward.active.landmarkId, 'amber-arch');
});

test('malformed input fails closed and leaves caller records unchanged', () => {
  const input = [{ id: 'bad', x: NaN, z: 0, discovered: true, investigated: true }];
  const before = structuredClone(input);
  const result = stepLandmarkFlightEncounter({ landmarks: input, position: { x: Infinity, z: NaN }, speed: NaN });
  assert.equal(result.active, null);
  assert.equal(result.event, null);
  assert.deepEqual(input, before);
});

test('completion lookup is idempotent and ignores malformed events', () => {
  const events = [
    { kind: 'landmark-flight-encounter', landmarkId: 'bell-spire' },
    { kind: 'other', landmarkId: 'bell-spire' },
    null,
  ];
  assert.equal(isCompletedLandmarkFlightEncounter(events, 'bell-spire'), true);
  assert.equal(isCompletedLandmarkFlightEncounter(events, 'unknown'), false);
  assert.equal(isCompletedLandmarkFlightEncounter(null, 'bell-spire'), false);
});
