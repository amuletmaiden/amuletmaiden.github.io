import assert from 'node:assert/strict';
import { createRuntimePresentationProfile } from '../src/core/runtime-presentation-profile.js';

function health(mode, quality) {
  return Object.freeze({ mode, quality: Object.freeze({ ...quality }) });
}

{
  const profile = createRuntimePresentationProfile({
    health: health('normal', {
      islandRadiusScale: 1,
      ambientDensityScale: 1,
      shadowScale: 1,
    }),
    devicePixelRatio: 3,
  });
  assert.equal(profile.mode, 'normal');
  assert.deepEqual(profile.streaming, { activateRange: 2400, deactivateRange: 3000 });
  assert.deepEqual(profile.renderer, { pixelRatio: 2, shadowsEnabled: true, shadowMapSize: 2048 });
  assert.equal(profile.atmosphere.ambientDensity, 1);
}

{
  const profile = createRuntimePresentationProfile({
    health: health('degraded', {
      islandRadiusScale: 0.78,
      ambientDensityScale: 0.65,
      shadowScale: 0.75,
    }),
    devicePixelRatio: 2,
    baseAmbientDensity: 0.8,
  });
  assert.equal(profile.mode, 'degraded');
  assert.deepEqual(profile.streaming, { activateRange: 1872, deactivateRange: 2340 });
  assert.deepEqual(profile.renderer, { pixelRatio: 1.35, shadowsEnabled: true, shadowMapSize: 1024 });
  assert.equal(profile.atmosphere.ambientDensity, 0.52);
}

{
  const profile = createRuntimePresentationProfile({
    health: health('critical', {
      islandRadiusScale: 0.55,
      ambientDensityScale: 0.35,
      shadowScale: 0.5,
    }),
    devicePixelRatio: 2.5,
  });
  assert.equal(profile.mode, 'critical');
  assert.deepEqual(profile.streaming, { activateRange: 1320, deactivateRange: 1650 });
  assert.deepEqual(profile.renderer, { pixelRatio: 1, shadowsEnabled: false, shadowMapSize: 0 });
  assert.equal(profile.atmosphere.ambientDensity, 0.35);
}

{
  const profile = createRuntimePresentationProfile({
    health: { mode: 'broken', quality: { islandRadiusScale: Infinity, ambientDensityScale: -4, shadowScale: NaN } },
    baseStreaming: { activateRange: NaN, deactivateRange: -Infinity },
    devicePixelRatio: Infinity,
    baseAmbientDensity: NaN,
  });
  assert.equal(profile.mode, 'normal');
  assert.deepEqual(profile.streaming, { activateRange: 2400, deactivateRange: 3000 });
  assert.deepEqual(profile.renderer, { pixelRatio: 1, shadowsEnabled: true, shadowMapSize: 2048 });
  assert.equal(profile.atmosphere.ambientDensity, 0);
  assert.doesNotThrow(() => JSON.stringify(profile));
}

{
  const input = {
    mode: 'degraded',
    quality: {
      islandRadiusScale: 0.78,
      ambientDensityScale: 0.65,
      shadowScale: 0.75,
    },
  };
  const snapshot = JSON.stringify(input);
  const first = createRuntimePresentationProfile({ health: input, devicePixelRatio: 2 });
  const second = createRuntimePresentationProfile({ health: input, devicePixelRatio: 2 });
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.streaming));
  assert.equal(first.telemetry.controlsPreserved, true);
  assert.equal(first.telemetry.savesPreserved, true);
  assert.equal(first.telemetry.landmarksPreserved, true);
  assert.equal(first.telemetry.mysteriesPreserved, true);
}

console.log('runtime presentation profile tests passed');
