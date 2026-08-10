import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSurveyToLandingSortie,
  createSurveyToLandingSortieState,
  surveyToLandingSortiePublicState,
} from '../src/core/survey-to-landing-sortie.js';

const island = Object.freeze({
  id: 'known-a',
  regionId: 'reach',
  x: 0,
  z: 0,
  radius: 180,
  landingZones: [Object.freeze({ id: 'known-a:landing-0', x: 80, y: 20, z: 0, radius: 70 })],
});

function frame(patch = {}) {
  return {
    surveyCompleted: true,
    surveyIsland: island,
    discoveredIslandIds: ['known-a'],
    currentRegionId: 'reach',
    position: { x: 700, y: 140, z: 0 },
    ready: true,
    paused: false,
    airborne: true,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    precisionTouchdownCompleted: false,
    touchdownIslandId: '',
    landedPosition: null,
    ...patch,
  };
}

function arm() {
  return advanceSurveyToLandingSortie(createSurveyToLandingSortieState(), frame());
}

function depart() {
  let state = arm();
  state = advanceSurveyToLandingSortie(state, frame({ surveyCompleted: false, position: { x: 950, y: 150, z: 0 } }));
  state = advanceSurveyToLandingSortie(state, frame({ surveyCompleted: false, position: { x: 1250, y: 160, z: 0 } }));
  return state;
}

test('arms only from truthful completed survey on discovered current-region island', () => {
  assert.equal(advanceSurveyToLandingSortie(createSurveyToLandingSortieState(), frame({ surveyCompleted: false })).active, false);
  assert.equal(advanceSurveyToLandingSortie(createSurveyToLandingSortieState(), frame({ discoveredIslandIds: [] })).active, false);
  assert.equal(advanceSurveyToLandingSortie(createSurveyToLandingSortieState(), frame({ currentRegionId: 'crown' })).active, false);
  assert.equal(arm().phase, 'depart');
});

test('requires meaningful departure beyond the completed survey envelope', () => {
  let state = arm();
  for (let index = 0; index < 20; index += 1) {
    state = advanceSurveyToLandingSortie(state, frame({ surveyCompleted: false, position: { x: 700 + (index % 2), y: 140, z: 0 } }));
  }
  assert.equal(state.phase, 'depart');
  assert.equal(state.departed, false);
  assert.equal(depart().phase, 'return');
});

test('premature, wrong-island and off-shelf touchdowns fail closed', () => {
  const premature = advanceSurveyToLandingSortie(arm(), frame({
    surveyCompleted: false,
    airborne: false,
    precisionTouchdownCompleted: true,
    touchdownIslandId: 'known-a',
    position: { x: 80, y: 20, z: 0 },
    landedPosition: { x: 80, y: 20, z: 0 },
  }));
  assert.equal(premature.completed, false);

  const ready = depart();
  const wrong = advanceSurveyToLandingSortie(ready, frame({
    surveyCompleted: false,
    airborne: false,
    precisionTouchdownCompleted: true,
    touchdownIslandId: 'known-b',
    position: { x: 80, y: 20, z: 0 },
    landedPosition: { x: 80, y: 20, z: 0 },
  }));
  assert.equal(wrong.completed, false);

  const offShelf = advanceSurveyToLandingSortie(ready, frame({
    surveyCompleted: false,
    airborne: false,
    precisionTouchdownCompleted: true,
    touchdownIslandId: 'known-a',
    position: { x: 600, y: 20, z: 0 },
    landedPosition: { x: 600, y: 20, z: 0 },
  }));
  assert.equal(offShelf.completed, false);
});

test('later truthful precision touchdown on the same authored island settles the sortie', () => {
  const state = advanceSurveyToLandingSortie(depart(), frame({
    surveyCompleted: false,
    airborne: false,
    precisionTouchdownCompleted: true,
    touchdownIslandId: 'known-a',
    position: { x: 80, y: 20, z: 0 },
    landedPosition: { x: 80, y: 20, z: 0 },
  }));
  assert.equal(state.completed, true);
  assert.deepEqual(surveyToLandingSortiePublicState(state), { available: true, active: false, phase: 'settle', completed: true });
});

test('interruptions reset an incomplete sortie', () => {
  for (const patch of [{ paused: true }, { recoveryActive: true }, { restorePublishing: true }, { crossingActive: true }]) {
    const reset = advanceSurveyToLandingSortie(depart(), frame({ surveyCompleted: false, ...patch }));
    assert.equal(reset.active, false);
    assert.equal(reset.completed, false);
  }
});

test('public state strips island and geometry internals and inputs remain immutable', () => {
  const state = depart();
  assert.deepEqual(surveyToLandingSortiePublicState(state), { available: true, active: true, phase: 'return', completed: false });
  assert.deepEqual(Object.keys(surveyToLandingSortiePublicState(state)), ['available', 'active', 'phase', 'completed']);

  const input = frame();
  const before = structuredClone(input);
  advanceSurveyToLandingSortie(createSurveyToLandingSortieState(), input);
  assert.deepEqual(input, before);
  assert.equal(island.landingZones[0].radius, 70);
});
