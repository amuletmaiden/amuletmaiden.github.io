import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRuntimePresentation,
  createRuntimePresentationActuatorState,
} from '../src/core/runtime-presentation-actuator.js';

function makeRenderer() {
  return {
    pixelRatioCalls: [],
    setPixelRatio(value) {
      this.pixelRatioCalls.push(value);
    },
    shadowMap: { enabled: true },
  };
}

function makeShadowLight() {
  const disposed = { count: 0 };
  return {
    disposed,
    shadow: {
      mapSize: {
        values: [],
        set(x, y) {
          this.values.push([x, y]);
        },
      },
      map: {
        dispose() {
          disposed.count += 1;
        },
      },
      needsUpdate: false,
    },
  };
}

const normal = Object.freeze({
  mode: 'normal',
  streaming: Object.freeze({ activateRange: 2400, deactivateRange: 3000 }),
  renderer: Object.freeze({ pixelRatio: 2, shadowsEnabled: true, shadowMapSize: 2048 }),
  atmosphere: Object.freeze({ ambientDensity: 1, ambientDensityScale: 1 }),
});

const critical = Object.freeze({
  mode: 'critical',
  streaming: Object.freeze({ activateRange: 1320, deactivateRange: 1650 }),
  renderer: Object.freeze({ pixelRatio: 1, shadowsEnabled: false, shadowMapSize: 0 }),
  atmosphere: Object.freeze({ ambientDensity: 0.35, ambientDensityScale: 0.35 }),
});

test('applies normal presentation settings to live renderer and shadow light', () => {
  const renderer = makeRenderer();
  const light = makeShadowLight();
  const result = applyRuntimePresentation({
    renderer,
    shadowLight: light,
    profile: normal,
    previous: createRuntimePresentationActuatorState(),
    devicePixelRatio: 3,
  });

  assert.deepEqual(renderer.pixelRatioCalls, [2]);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.deepEqual(light.shadow.mapSize.values, [[2048, 2048]]);
  assert.equal(light.disposed.count, 1);
  assert.equal(light.shadow.needsUpdate, true);
  assert.deepEqual(result.streaming, { activateRange: 2400, deactivateRange: 3000 });
  assert.equal(result.telemetry.controlsPreserved, true);
});

test('critical mode reduces optional presentation cost without touching traversal contracts', () => {
  const renderer = makeRenderer();
  const light = makeShadowLight();
  const previous = applyRuntimePresentation({
    renderer,
    shadowLight: light,
    profile: normal,
    previous: createRuntimePresentationActuatorState(),
  }).state;

  const result = applyRuntimePresentation({
    renderer,
    shadowLight: light,
    profile: critical,
    previous,
  });

  assert.deepEqual(renderer.pixelRatioCalls, [2, 1]);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(result.renderer.shadowMapSize, 0);
  assert.equal(result.atmosphere.ambientDensity, 0.35);
  assert.equal(result.telemetry.traversalPreserved, true);
  assert.equal(result.telemetry.savesPreserved, true);
});

test('reapplying an unchanged profile does not churn renderer resources', () => {
  const renderer = makeRenderer();
  const light = makeShadowLight();
  const first = applyRuntimePresentation({
    renderer,
    shadowLight: light,
    profile: normal,
    previous: createRuntimePresentationActuatorState(),
  });
  const second = applyRuntimePresentation({
    renderer,
    shadowLight: light,
    profile: normal,
    previous: first.state,
  });

  assert.deepEqual(renderer.pixelRatioCalls, [2]);
  assert.equal(light.disposed.count, 1);
  assert.deepEqual(second.telemetry.changes, []);
  assert.equal(second.state.applicationCount, 2);
});

test('malformed profiles recover to finite bounded settings', () => {
  const renderer = makeRenderer();
  const result = applyRuntimePresentation({
    renderer,
    profile: {
      mode: 'broken',
      streaming: { activateRange: Number.NaN, deactivateRange: -5 },
      renderer: { pixelRatio: Number.POSITIVE_INFINITY, shadowsEnabled: true, shadowMapSize: -10 },
      atmosphere: { ambientDensity: Number.NaN, ambientDensityScale: 99 },
    },
    devicePixelRatio: 1.5,
  });

  assert.equal(result.state.mode, 'normal');
  assert.deepEqual(result.streaming, { activateRange: 2400, deactivateRange: 2700 });
  assert.equal(result.renderer.pixelRatio, 1.5);
  assert.equal(result.renderer.shadowMapSize, 512);
  assert.equal(result.atmosphere.ambientDensity, 1);
  assert.equal(result.atmosphere.ambientDensityScale, 1);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('outputs are immutable and inputs remain untouched', () => {
  const profile = structuredClone(normal);
  const before = structuredClone(profile);
  const result = applyRuntimePresentation({ profile });

  assert.deepEqual(profile, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.streaming), true);
  assert.equal(Object.isFrozen(result.telemetry.changes), true);
});
