import assert from 'node:assert/strict';
import {
  deriveDiscoveredLandingShelfCues,
  discoveredLandingShelfPresentationPolicy,
  discoveredLandingShelfCuePublicState,
} from '../src/core/discovered-landing-shelf-cues.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({
      id: 'known', regionId: 'r1',
      landingZones: Object.freeze([
        Object.freeze({ id: 'shelf-a', x: 0, y: 120, z: 0, radius: 70, heading: 0.5 }),
        Object.freeze({ id: 'shelf-b', x: 700, y: 140, z: 0, radius: 55, heading: -0.2 }),
      ]),
    }),
    Object.freeze({
      id: 'hidden', regionId: 'r1',
      landingZones: Object.freeze([Object.freeze({ id: 'secret-shelf', x: 80, y: 110, z: 0, radius: 90, heading: 0 })]),
    }),
    Object.freeze({
      id: 'other-region', regionId: 'r2',
      landingZones: Object.freeze([Object.freeze({ id: 'other-shelf', x: 60, y: 100, z: 0, radius: 80, heading: 0 })]),
    }),
  ]),
});

function derive(overrides = {}) {
  return deriveDiscoveredLandingShelfCues({
    world,
    currentRegionId: 'r1',
    discoveredIslandIds: ['known'],
    position: { x: 0, y: 430, z: 0 },
    ...overrides,
  });
}

{
  const result = derive();
  assert.equal(result.active, true);
  assert.ok(result.cues.length >= 1);
  assert.ok(result.cues.every((cue) => cue.islandId === 'known'));
  assert.ok(result.cues.every((cue) => cue.zoneId !== 'secret-shelf'));
  assert.ok(result.cues.every((cue) => cue.zoneId !== 'other-shelf'));
}

{
  assert.deepEqual(derive({ discoveredIslandIds: [] }), { active: false, approachClass: null, cues: [] });
  assert.deepEqual(derive({ currentRegionId: 'r2', discoveredIslandIds: ['known'] }), { active: false, approachClass: null, cues: [] });
}

{
  assert.deepEqual(derive({ position: { x: 4000, y: 430, z: 0 } }), { active: false, approachClass: null, cues: [] });
  assert.deepEqual(derive({ position: { x: 0, y: 122, z: 0 } }), { active: false, approachClass: null, cues: [] });
  assert.deepEqual(derive({ position: { x: 0, y: 1200, z: 0 } }), { active: false, approachClass: null, cues: [] });
}

{
  const acquiring = derive({ position: { x: 1000, y: 650, z: 0 } });
  const readable = derive({ position: { x: 520, y: 390, z: 0 } });
  const final = derive({ position: { x: 120, y: 250, z: 0 } });
  assert.equal(acquiring.approachClass, 'acquiring');
  assert.equal(readable.approachClass, 'readable');
  assert.equal(final.approachClass, 'final');
}

for (const flag of ['grounded', 'recoveryActive', 'crossingActive', 'restorePublishing']) {
  assert.deepEqual(derive({ [flag]: true }), { active: false, approachClass: null, cues: [] });
}

{
  const normal = derive({ position: { x: 1000, y: 650, z: 0 } });
  const contrast = derive({ position: { x: 1000, y: 650, z: 0 }, highContrast: true });
  assert.equal(normal.cues.length, contrast.cues.length);
  assert.deepEqual(normal.cues.map((cue) => cue.zoneId), contrast.cues.map((cue) => cue.zoneId));
  assert.equal(normal.approachClass, 'acquiring');
  assert.equal(contrast.approachClass, 'readable');
}

{
  const normal = derive();
  const reduced = derive({ reducedMotion: true });
  assert.deepEqual(
    normal.cues.map(({ zoneId, approachClass }) => ({ zoneId, approachClass })),
    reduced.cues.map(({ zoneId, approachClass }) => ({ zoneId, approachClass })),
  );
}

{
  const before = JSON.stringify(world);
  derive();
  assert.equal(JSON.stringify(world), before);
}

{
  for (const phase of ['acquiring', 'readable', 'final']) {
    const policy = discoveredLandingShelfPresentationPolicy(phase);
    const contrast = discoveredLandingShelfPresentationPolicy(phase, { highContrast: true });
    assert.equal(policy.depthTest, true);
    assert.equal(policy.depthWrite, false);
    assert.equal(policy.fog, true);
    assert.equal(policy.xray, false);
    assert.ok(policy.opacity > 0 && policy.opacity <= 0.58);
    assert.ok(contrast.opacity >= policy.opacity && contrast.opacity <= 0.58);
  }
}

{
  const malformed = deriveDiscoveredLandingShelfCues({
    world: { islands: [{ id: 'known', regionId: 'r1', landingZones: [{ id: 'bad', x: NaN, radius: -1 }] }] },
    currentRegionId: 'r1',
    discoveredIslandIds: ['known'],
    position: { x: 0, y: 300, z: 0 },
  });
  assert.deepEqual(malformed, { active: false, approachClass: null, cues: [] });
}

{
  const publicState = discoveredLandingShelfCuePublicState(derive());
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'approachClass']);
  assert.equal('cues' in publicState, false);
  assert.equal('zoneId' in publicState, false);
  assert.equal('radius' in publicState, false);
}

console.log('discovered-landing-shelf-cues regressions passed');
