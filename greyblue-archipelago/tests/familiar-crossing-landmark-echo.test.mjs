import assert from 'node:assert/strict';
import {
  familiarCrossingLandmarkEchoPublicState,
  selectFamiliarCrossingLandmarkEcho,
} from '../src/core/familiar-crossing-landmark-echo.js';

const world = {
  routes: [
    { id: 'route-known', fromIslandId: 'isle-a', toIslandId: 'isle-b' },
    { id: 'route-hidden', fromIslandId: 'isle-secret', toIslandId: 'isle-b' },
  ],
  islands: [
    { id: 'isle-a', regionId: 'region-a', landmarkRecord: { id: 'landmark-z', encounter: { class: 'relic' } } },
    { id: 'isle-b', regionId: 'region-b', landmarkRecord: { id: 'landmark-b', encounter: { class: 'resonance' } } },
    { id: 'isle-c', regionId: 'region-a', landmarkRecord: { id: 'landmark-a', encounter: { class: 'instrument' } } },
    { id: 'isle-uninvestigated', regionId: 'region-b', landmarkRecord: { id: 'landmark-0', encounter: { class: 'threshold' } } },
    { id: 'isle-secret', regionId: 'region-secret', landmarkRecord: { id: 'secret-landmark', encounter: { class: 'relic' } } },
  ],
};

const base = {
  world,
  activeRouteId: 'route-known',
  familiarCrossing: { active: true, familiar: true, signature: 'hush' },
  listenRequested: true,
  discoveredRouteIds: ['route-known'],
  discoveredIslandIds: ['isle-a', 'isle-b', 'isle-c', 'isle-uninvestigated'],
  investigatedLandmarkIds: ['landmark-z', 'landmark-b', 'landmark-a'],
};

const selected = selectFamiliarCrossingLandmarkEcho(base);
assert.equal(selected.active, true);
assert.equal(selected.landmarkId, 'landmark-a', 'stable lexical landmark ordering should choose the same known echo');
assert.equal(selected.echoClass, 'instrument');
assert.deepEqual(familiarCrossingLandmarkEchoPublicState(selected), { active: true, echoClass: 'instrument' });

assert.equal(selectFamiliarCrossingLandmarkEcho({ ...base, listenRequested: false }).active, false, 'passive crossing state must not echo');
assert.equal(selectFamiliarCrossingLandmarkEcho({ ...base, familiarCrossing: { active: false, familiar: true } }).active, false, 'selection-only state must fail closed');
assert.equal(selectFamiliarCrossingLandmarkEcho({ ...base, familiarCrossing: { active: true, familiar: false } }).active, false, 'unfamiliar crossing must fail closed');
assert.equal(selectFamiliarCrossingLandmarkEcho({ ...base, recoveryActive: true }).active, false, 'recovery must suppress echoes');
assert.equal(selectFamiliarCrossingLandmarkEcho({ ...base, activeRouteId: 'route-hidden' }).active, false, 'undiscovered route must fail closed');

const onlyUninvestigated = selectFamiliarCrossingLandmarkEcho({
  ...base,
  investigatedLandmarkIds: [],
});
assert.equal(onlyUninvestigated.active, false, 'uninvestigated landmarks must never answer');

const duplicateSuppressed = selectFamiliarCrossingLandmarkEcho({
  ...base,
  heardLandmarkIds: ['landmark-a'],
});
assert.equal(duplicateSuppressed.landmarkId, 'landmark-b', 'crossing-local heard set should suppress a duplicate and choose the next eligible known echo');

const exhausted = selectFamiliarCrossingLandmarkEcho({
  ...base,
  heardLandmarkIds: ['landmark-a', 'landmark-b', 'landmark-z'],
});
assert.equal(exhausted.active, false, 'an exhausted crossing episode must not repeat a landmark echo');

const secretInput = {
  ...base,
  world: structuredClone(world),
  hiddenCoordinates: { x: 999, z: -999 },
  secretEndpoint: 'isle-secret',
};
const before = JSON.stringify(secretInput);
const publicState = familiarCrossingLandmarkEchoPublicState(selectFamiliarCrossingLandmarkEcho(secretInput));
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'echoClass']);
assert.equal(JSON.stringify(publicState).includes('secret'), false);
assert.equal(JSON.stringify(publicState).includes('999'), false);
assert.equal(JSON.stringify(secretInput), before, 'caller input must remain immutable');

const malformed = familiarCrossingLandmarkEchoPublicState(selectFamiliarCrossingLandmarkEcho({
  world: { routes: [{ id: 7 }], islands: [{ id: { bad: true } }] },
  activeRouteId: { secret: true },
  familiarCrossing: { active: true, familiar: true },
  listenRequested: true,
  discoveredRouteIds: ['route-known'],
  discoveredIslandIds: ['isle-a'],
  investigatedLandmarkIds: ['landmark-a'],
}));
assert.deepEqual(malformed, { active: false, echoClass: null });

console.log('familiar-crossing-landmark-echo regressions passed');
