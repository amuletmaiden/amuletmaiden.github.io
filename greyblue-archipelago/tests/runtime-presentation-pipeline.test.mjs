import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRuntimePresentationPipelineState,
  stepRuntimePresentationPipeline,
} from '../src/core/runtime-presentation-pipeline.js';

function makeRenderer() {
  return {
    ratios: [],
    setPixelRatio(value) { this.ratios.push(value); },
    shadowMap: { enabled: true },
  };
}

function makeLight() {
  return {
    shadow: {
      mapSize: {
        values: [],
        set(x, y) { this.values.push([x, y]); },
      },
      map: {
        disposed: false,
        dispose() { this.disposed = true; },
      },
      needsUpdate: false,
    },
  };
}

test('healthy frame produces normal bounded presentation', () => {
  const renderer = makeRenderer();
  const light = makeLight();
  const result = stepRuntimePresentationPipeline({
    previous: createRuntimePresentationPipelineState(),
    sample: { frameMs: 16, activeIslands: 8, pendingLoads: 0 },
    renderer,
    shadowLight: light,
    devicePixelRatio: 3,
  });

  assert.equal(result.profile.mode, 'normal');
  assert.equal(result.profile.renderer.pixelRatio, 2);
  assert.equal(result.streaming.activateRange, 2400);
  assert.equal(result.telemetry.playableSystemsPreserved.controls, true);
  assert.equal(result.state.frameCount, 1);
});

test('sustained overload reaches critical and preserves playable systems', () => {
  const renderer = makeRenderer();
  const light = makeLight();
  let state = createRuntimePresentationPipelineState();
  let result;

  for (let index = 0; index < 12; index += 1) {
    result = stepRuntimePresentationPipeline({
      previous: state,
      sample: { frameMs: 55, activeIslands: 30, pendingLoads: 8 },
      renderer,
      shadowLight: light,
      devicePixelRatio: 2,
    });
    state = result.state;
  }

  assert.equal(result.profile.mode, 'critical');
  assert.equal(result.profile.renderer.shadowsEnabled, false);
  assert.equal(result.profile.renderer.pixelRatio, 1);
  assert.equal(result.streaming.activateRange, 1320);
  assert.deepEqual(result.telemetry.playableSystemsPreserved, {
    controls: true,
    traversal: true,
    saves: true,
    landmarks: true,
    mysteries: true,
  });
});

test('unchanged profile does not repeat renderer churn', () => {
  const renderer = makeRenderer();
  const light = makeLight();
  const first = stepRuntimePresentationPipeline({
    sample: { frameMs: 16, activeIslands: 4, pendingLoads: 0 },
    renderer,
    shadowLight: light,
  });
  const second = stepRuntimePresentationPipeline({
    previous: first.state,
    sample: { frameMs: 16, activeIslands: 4, pendingLoads: 0 },
    renderer,
    shadowLight: light,
  });

  assert.equal(renderer.ratios.length, 1);
  assert.deepEqual(second.telemetry.presentation.changes, []);
});

test('malformed sample remains finite and JSON safe', () => {
  const source = { frameMs: Number.NaN, activeIslands: Infinity, pendingLoads: -Infinity };
  const snapshot = { ...source };
  const result = stepRuntimePresentationPipeline({ sample: source });

  assert.deepEqual(source, snapshot);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(Number.isFinite(result.telemetry.health.frameMs), true);
  assert.equal(Number.isFinite(result.streaming.activateRange), true);
});
