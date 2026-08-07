import assert from 'node:assert/strict';
import { createLandmarkEncounterState, selectLandmarkEncounter, activateLandmarkEncounter } from '../src/core/landmark-encounter-model.js';

const world = {
  islands: [
    {
      id: 'isle-a', x: 100, z: 0,
      landmarkRecord: {
        id: 'isle-a:landmark',
        title: 'The Hushed Bell · drowned bell',
        clue: 'Rain keeps the old answer.',
        encounter: {
          class: 'resonance',
          triggerRadius: 200,
          minimumAltitude: 40,
          revealText: 'The bell answers once through the rain.',
        },
      },
    },
    {
      id: 'isle-b', x: 500, z: 0,
      landmarkRecord: {
        id: 'isle-b:landmark',
        title: 'Far Lens',
        encounter: { class: 'instrument', triggerRadius: 120, minimumAltitude: 20, revealText: 'Cold light turns inland.' },
      },
    },
  ],
};

{
  const result = selectLandmarkEncounter({ world, position: { x: 0, y: 60, z: 0 } });
  assert.equal(result.view.visible, true);
  assert.equal(result.view.available, true);
  assert.equal(result.view.landmarkId, 'isle-a:landmark');
  assert.equal(result.view.encounterClass, 'resonance');
  assert.equal(result.view.distance, 100);
}

{
  const result = selectLandmarkEncounter({ world, position: { x: 0, y: 10, z: 0 } });
  assert.equal(result.view.available, false);
  assert.match(result.view.prompt, /Climb to 40m/);
}

{
  const selected = selectLandmarkEncounter({ world, position: { x: 0, y: 60, z: 0 } });
  const activated = activateLandmarkEncounter(selected.state, selected.view);
  assert.equal(activated.changed, true);
  assert.equal(activated.reveal.text, 'The bell answers once through the rain.');
  assert.deepEqual(activated.state.visitedIds, ['isle-a:landmark']);
  const again = selectLandmarkEncounter({ world, position: { x: 0, y: 60, z: 0 } }, activated.state);
  assert.equal(again.view.visited, true);
  assert.equal(again.view.available, false);
  assert.equal(activateLandmarkEncounter(again.state, again.view).changed, false);
}

{
  const result = selectLandmarkEncounter({ world, position: { x: 2000, y: 80, z: 0 } });
  assert.equal(result.view.visible, false);
}

{
  const malformed = selectLandmarkEncounter({ world, position: { x: NaN, y: Infinity, z: undefined } });
  assert.equal(Number.isFinite(malformed.view.distance ?? 0), true);
  assert.doesNotThrow(() => JSON.stringify(malformed));
}

{
  const state = createLandmarkEncounterState({ visitedIds: ['x', 'x', '', null, 'y'] });
  assert.deepEqual(state.visitedIds, ['x', 'y']);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.visitedIds), true);
}

console.log('landmark encounter model tests passed');
