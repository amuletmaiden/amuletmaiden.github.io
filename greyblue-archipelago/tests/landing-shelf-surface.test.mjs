import assert from 'node:assert/strict';
import test from 'node:test';
import { composeLandingShelfHeight, landingShelfSurfaceInternals } from '../src/world/landing-shelf-surface.js';

const zone = Object.freeze({ id: 'landing-0', x: 30, y: 18, z: -20, radius: 80 });

function sampleAt(distance, baseHeight = 92) {
  return composeLandingShelfHeight({
    baseHeight,
    x: zone.x + distance,
    z: zone.z,
    landingZones: [zone],
  });
}

test('the authored landing-zone center is a real shelf height', () => {
  assert.equal(sampleAt(0), zone.y);
});

test('the shelf core remains stable before blending back to radial terrain', () => {
  const core = zone.radius * landingShelfSurfaceInternals.CORE_RADIUS_RATIO;
  assert.equal(sampleAt(core * 0.95), zone.y);
  const transition = sampleAt(core + (zone.radius - core) * 0.5);
  assert.equal(transition > zone.y, true);
  assert.equal(transition < 92, true);
});

test('the blend approaches existing terrain smoothly and is exact outside the zone', () => {
  const nearOuter = sampleAt(zone.radius * 0.99);
  const outer = sampleAt(zone.radius);
  const beyond = sampleAt(zone.radius + 1);
  assert.equal(nearOuter > zone.y, true);
  assert.equal(nearOuter <= 92, true);
  assert.equal(outer, 92);
  assert.equal(beyond, 92);
});

test('a shelf can meet authored terrain above or below the generic radial hill without overshoot', () => {
  const raised = sampleAt(0, 8);
  const raisedBlend = sampleAt(65, 8);
  assert.equal(raised, 18);
  assert.equal(raisedBlend <= 18 && raisedBlend >= 8, true);

  const cut = sampleAt(0, 140);
  const cutBlend = sampleAt(65, 140);
  assert.equal(cut, 18);
  assert.equal(cutBlend >= 18 && cutBlend <= 140, true);
});

test('nearest containing valid zone wins while malformed zones are ignored', () => {
  const second = { x: 36, y: 25, z: -20, radius: 30 };
  const result = composeLandingShelfHeight({
    baseHeight: 100,
    x: 36,
    z: -20,
    landingZones: [{ x: Number.NaN, y: 2, z: 0, radius: 10 }, zone, second],
  });
  assert.equal(result, second.y);
});

test('outside, malformed, and missing inputs preserve existing surface truth and caller data', () => {
  const zones = [{ ...zone }];
  const before = JSON.stringify(zones);
  assert.equal(composeLandingShelfHeight({ baseHeight: 77, x: 900, z: 900, landingZones: zones }), 77);
  assert.equal(composeLandingShelfHeight({ baseHeight: 77, x: 30, z: -20, landingZones: null }), 77);
  assert.equal(Number.isNaN(composeLandingShelfHeight({ baseHeight: Number.NaN, x: 30, z: -20, landingZones: zones })), true);
  assert.equal(JSON.stringify(zones), before);
});
