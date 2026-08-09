import assert from 'node:assert/strict';
import {
  deriveKnownLandmarkMistCues,
  knownLandmarkMistCuePresentationPolicy,
  knownLandmarkMistCuePublicState,
} from '../src/core/known-landmark-mist-cues.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'a', regionId: 'r1', x: 900, z: 0, height: 120, landmarkRecord: Object.freeze({ id: 'la' }) }),
    Object.freeze({ id: 'b', regionId: 'r1', x: 1500, z: 0, height: 160, landmarkRecord: Object.freeze({ id: 'lb' }) }),
    Object.freeze({ id: 'c', regionId: 'r1', x: 600, z: 500, height: 130, landmarkRecord: Object.freeze({ id: 'lc' }) }),
    Object.freeze({ id: 'd', regionId: 'r2', x: 500, z: 0, height: 110, landmarkRecord: Object.freeze({ id: 'ld' }) }),
    Object.freeze({ id: 'hidden', regionId: 'r1', x: 450, z: 0, height: 90, landmarkRecord: Object.freeze({ id: 'secret' }) }),
  ]),
});

function derive(overrides = {}) {
  return deriveKnownLandmarkMistCues({
    world,
    currentRegionId: 'r1',
    discoveredIslandIds: ['a', 'b', 'c', 'hidden'],
    investigatedLandmarkIds: ['la', 'lb', 'lc'],
    position: { x: 0, y: 190, z: 0 },
    fogDensity: 0.00016,
    ...overrides,
  });
}

{
  const result = derive();
  assert.equal(result.active, true);
  assert.ok(result.cues.length >= 2);
  assert.ok(result.cues.every((cue) => ['la', 'lb', 'lc'].includes(cue.landmarkId)));
  assert.ok(result.cues.every((cue) => cue.landmarkId !== 'secret'));
  assert.ok(result.cues.every((cue) => cue.islandId !== 'hidden'));
}

{
  const result = derive({ investigatedLandmarkIds: [] });
  assert.deepEqual(result, { active: false, cueClass: null, cues: [] });
}

{
  const result = derive({ discoveredIslandIds: [] });
  assert.deepEqual(result, { active: false, cueClass: null, cues: [] });
}

{
  const result = derive({ currentRegionId: 'r2', discoveredIslandIds: ['d'], investigatedLandmarkIds: ['ld'] });
  assert.equal(result.active, true);
  assert.deepEqual(result.cues.map((cue) => cue.landmarkId), ['ld']);
}

{
  const result = derive({ position: { x: -6000, y: 190, z: 0 } });
  assert.deepEqual(result, { active: false, cueClass: null, cues: [] });
}

{
  const clearAir = derive({ fogDensity: 0.00004 });
  const heavyFog = derive({ fogDensity: 0.001 });
  assert.ok(clearAir.cues.length >= heavyFog.cues.length);
}

{
  const normal = derive({ position: { x: 0, y: 190, z: 0 } });
  const highContrast = derive({ position: { x: 0, y: 190, z: 0 }, highContrast: true });
  const normalById = new Map(normal.cues.map((cue) => [cue.landmarkId, cue.cueClass]));
  for (const cue of highContrast.cues) {
    assert.ok(normalById.has(cue.landmarkId));
    if (normalById.get(cue.landmarkId) === 'distant') assert.equal(cue.cueClass, 'emerging');
  }
}

{
  const normal = derive();
  const reduced = derive({ reducedMotion: true });
  assert.deepEqual(
    reduced.cues.map(({ landmarkId, cueClass }) => ({ landmarkId, cueClass })),
    normal.cues.map(({ landmarkId, cueClass }) => ({ landmarkId, cueClass })),
  );
}

for (const flag of ['recoveryActive', 'crossingActive', 'restorePublishing', 'localizedInteractionActive']) {
  const result = derive({ [flag]: true });
  assert.deepEqual(result, { active: false, cueClass: null, cues: [] });
}

{
  const malformed = deriveKnownLandmarkMistCues({ world: { islands: [{ id: 'x', regionId: 'r1', x: NaN }] } });
  assert.deepEqual(malformed, { active: false, cueClass: null, cues: [] });
}

{
  for (const cueClass of ['distant', 'emerging', 'near']) {
    const normal = knownLandmarkMistCuePresentationPolicy(cueClass);
    const contrast = knownLandmarkMistCuePresentationPolicy(cueClass, { highContrast: true });
    assert.equal(normal.depthTest, true);
    assert.equal(normal.depthWrite, false);
    assert.equal(normal.fog, true);
    assert.equal(normal.xray, false);
    assert.ok(normal.opacity > 0 && normal.opacity <= 0.62);
    assert.ok(contrast.opacity >= normal.opacity && contrast.opacity <= 0.62);
  }
}

{
  const result = derive();
  const publicState = knownLandmarkMistCuePublicState(result);
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'cueClass']);
  assert.equal('cues' in publicState, false);
  assert.equal('landmarkId' in publicState, false);
  assert.equal('x' in publicState, false);
}

{
  const discovered = ['a', 'b'];
  const investigated = ['la', 'lb'];
  const beforeDiscovered = [...discovered];
  const beforeInvestigated = [...investigated];
  derive({ discoveredIslandIds: discovered, investigatedLandmarkIds: investigated });
  assert.deepEqual(discovered, beforeDiscovered);
  assert.deepEqual(investigated, beforeInvestigated);
}

console.log('known-landmark-mist-cues regressions passed');
