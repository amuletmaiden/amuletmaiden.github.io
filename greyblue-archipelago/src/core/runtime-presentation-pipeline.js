import {
  createRuntimeHealthState,
  updateRuntimeHealth,
} from './runtime-health-budget.js';
import { createRuntimePresentationProfile } from './runtime-presentation-profile.js';
import {
  applyRuntimePresentation,
  createRuntimePresentationActuatorState,
} from './runtime-presentation-actuator.js';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createRuntimePresentationPipelineState() {
  return Object.freeze({
    health: createRuntimeHealthState(),
    actuator: createRuntimePresentationActuatorState(),
    frameCount: 0,
    lastMode: 'normal',
  });
}

export function stepRuntimePresentationPipeline({
  previous,
  sample,
  renderer,
  shadowLight,
  baseStreaming,
  devicePixelRatio = 1,
  baseAmbientDensity = 1,
  healthConfig,
} = {}) {
  const prior = previous && typeof previous === 'object'
    ? previous
    : createRuntimePresentationPipelineState();
  const normalizedSample = Object.freeze({
    frameMs: clamp(finite(sample?.frameMs, 16.7), 0, 1000),
    activeIslands: Math.round(clamp(finite(sample?.activeIslands, 0), 0, 10000)),
    pendingLoads: Math.round(clamp(finite(sample?.pendingLoads, 0), 0, 10000)),
  });

  const health = updateRuntimeHealth(prior.health, normalizedSample, healthConfig);
  const profile = createRuntimePresentationProfile({
    health,
    baseStreaming,
    devicePixelRatio,
    baseAmbientDensity,
  });
  const applied = applyRuntimePresentation({
    renderer,
    shadowLight,
    profile,
    previous: prior.actuator,
    devicePixelRatio,
  });

  const frameCount = Math.round(finite(prior.frameCount, 0)) + 1;
  const state = Object.freeze({
    health,
    actuator: applied.state,
    frameCount,
    lastMode: profile.mode,
  });

  return Object.freeze({
    state,
    profile,
    streaming: applied.streaming,
    atmosphere: applied.atmosphere,
    telemetry: Object.freeze({
      frameCount,
      mode: profile.mode,
      health: health.telemetry,
      presentation: applied.telemetry,
      playableSystemsPreserved: Object.freeze({
        controls: true,
        traversal: true,
        saves: true,
        landmarks: true,
        mysteries: true,
      }),
    }),
  });
}
