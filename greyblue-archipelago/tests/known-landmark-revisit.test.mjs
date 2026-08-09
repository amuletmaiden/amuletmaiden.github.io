import assert from 'node:assert/strict';
import {
  deriveKnownLandmarkRevisit,
  knownLandmarkRevisitPublicState,
} from '../src/core/known-landmark-revisit.js';

const world = {
  islands: [
    {
      id: 'isle-a',
      regionId: 'region-a',
      landmarkRecord: { id: 'landmark-a', encounter: { class: 'resonance' } },
    },
    {
      id: 'isle-b',
      regionId: 'region-a',
      landmarkRecord: { id: 'landmark-b', encounter: { class: 'relic' } },
    },
  ],
};

const base = {
  world,
  currentRegionId: 'region-a',
  currentIslandId: 'isle-a',
  currentLandmarkId: 'landmark-a',
  discoveredIslandIds: ['isle-a'],
  investigatedLandmarkIds: ['landmark-a'],
  encounterPresent: true,
  interactionRequested: true,
  currentAtmosphere: 'mist',
  visitEpisodeId: 'visit-1',
};

const active = deriveKnownLandmarkRevisit(base);
assert.equal(active.available, true);
assert.equal(active.active, true);
assert.ok(['hush', 'resonance', 'weathering', 'glint'].includes(active.variation));

const stable = deriveKnownLandmarkRevisit({ ...base });
assert.equal(stable.variation, active.variation, 'same known place and public atmosphere must be stable');

assert.equal(deriveKnownLandmarkRevisit({ ...base, interactionRequested: false }).active, false, 'passive proximity must not activate revisit response');
assert.equal(deriveKnownLandmarkRevisit({ ...base, encounterPresent: false }).available, false, 'remote state must fail closed');
assert.equal(deriveKnownLandmarkRevisit({ ...base, discoveredIslandIds: [] }).available, false, 'undiscovered island must fail closed');
assert.equal(deriveKnownLandmarkRevisit({ ...base, investigatedLandmarkIds: [] }).available, false, 'uninvestigated landmark must fail closed');
assert.equal(deriveKnownLandmarkRevisit({ ...base, currentLandmarkId: 'landmark-b' }).available, false, 'wrong exact landmark must fail closed');
assert.equal(deriveKnownLandmarkRevisit({ ...base, currentIslandId: 'isle-b' }).available, false, 'wrong exact island must fail closed');
assert.equal(deriveKnownLandmarkRevisit({ ...base, recoveryActive: true }).available, false, 'recovery must suppress revisit');
assert.equal(deriveKnownLandmarkRevisit({ ...base, crossingActive: true }).available, false, 'crossing transit must suppress revisit');
assert.equal(deriveKnownLandmarkRevisit({ ...base, restorePublishing: true }).available, false, 'restore publication must suppress revisit');

const duplicate = deriveKnownLandmarkRevisit({
  ...base,
  previousEpisode: active.episode,
});
assert.equal(duplicate.available, false, 'one continuous visit episode must not replay response');
assert.equal(duplicate.active, false);

const afterDeparture = deriveKnownLandmarkRevisit({
  ...base,
  visitEpisodeId: 'visit-2',
  previousEpisode: active.episode,
});
assert.equal(afterDeparture.available, true, 'truthful departure/new visit episode resets suppression');
assert.equal(afterDeparture.active, true);

const parity = deriveKnownLandmarkRevisit({ ...base, reducedMotion: true, soundEnabled: false });
assert.equal(parity.available, active.available, 'reduced motion and muted sound must preserve interaction semantics');
assert.equal(parity.active, active.active);
assert.equal(parity.variation, active.variation);

const secretInput = {
  ...base,
  world: structuredClone(world),
  hiddenRoute: 'secret-route',
  coordinates: { x: 999, z: -999 },
};
const before = JSON.stringify(secretInput);
const publicState = knownLandmarkRevisitPublicState(deriveKnownLandmarkRevisit(secretInput));
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'available', 'variation']);
assert.equal(JSON.stringify(publicState).includes('secret'), false);
assert.equal(JSON.stringify(publicState).includes('999'), false);
assert.equal(JSON.stringify(secretInput), before, 'caller input must remain immutable');

const malformed = knownLandmarkRevisitPublicState(deriveKnownLandmarkRevisit({
  world: { islands: [{ id: { bad: true }, regionId: 7, landmarkRecord: { id: ['bad'] } }] },
  currentRegionId: { secret: true },
  currentIslandId: 3,
  currentLandmarkId: { nope: true },
  discoveredIslandIds: ['isle-a'],
  investigatedLandmarkIds: ['landmark-a'],
  encounterPresent: true,
  interactionRequested: true,
  visitEpisodeId: 'visit-x',
}));
assert.deepEqual(malformed, { available: false, active: false, variation: null });

console.log('known-landmark-revisit regressions passed');
