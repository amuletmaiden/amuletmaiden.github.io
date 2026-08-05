const DEFAULTS = Object.freeze({
  targetFrameMs: 16.7,
  degradedFrameMs: 25,
  criticalFrameMs: 40,
  recoverySamples: 90,
  criticalSamples: 12,
  maxRecentSamples: 120,
  maxActiveIslands: 18,
  maxPendingLoads: 4,
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfig(config = {}) {
  const targetFrameMs = clamp(finite(config.targetFrameMs, DEFAULTS.targetFrameMs), 8, 50);
  const degradedFrameMs = clamp(finite(config.degradedFrameMs, DEFAULTS.degradedFrameMs), targetFrameMs, 80);
  const criticalFrameMs = clamp(finite(config.criticalFrameMs, DEFAULTS.criticalFrameMs), degradedFrameMs, 150);
  return Object.freeze({
    targetFrameMs,
    degradedFrameMs,
    criticalFrameMs,
    recoverySamples: Math.round(clamp(finite(config.recoverySamples, DEFAULTS.recoverySamples), 1, 600)),
    criticalSamples: Math.round(clamp(finite(config.criticalSamples, DEFAULTS.criticalSamples), 1, 120)),
    maxRecentSamples: Math.round(clamp(finite(config.maxRecentSamples, DEFAULTS.maxRecentSamples), 12, 600)),
    maxActiveIslands: Math.round(clamp(finite(config.maxActiveIslands, DEFAULTS.maxActiveIslands), 1, 128)),
    maxPendingLoads: Math.round(clamp(finite(config.maxPendingLoads, DEFAULTS.maxPendingLoads), 0, 32)),
  });
}

export function createRuntimeHealthState() {
  return Object.freeze({
    mode: 'normal',
    recentFrameMs: Object.freeze([]),
    consecutiveCritical: 0,
    consecutiveHealthy: 0,
    transitionCount: 0,
  });
}

export function updateRuntimeHealth(previous, sample = {}, config = {}) {
  const settings = normalizeConfig(config);
  const prior = previous && typeof previous === 'object' ? previous : createRuntimeHealthState();
  const frameMs = clamp(finite(sample.frameMs, settings.targetFrameMs), 0, 1000);
  const activeIslands = Math.round(clamp(finite(sample.activeIslands, 0), 0, 10000));
  const pendingLoads = Math.round(clamp(finite(sample.pendingLoads, 0), 0, 10000));
  const recent = [...(Array.isArray(prior.recentFrameMs) ? prior.recentFrameMs : []), frameMs]
    .slice(-settings.maxRecentSamples);
  const averageFrameMs = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
  const overloaded = activeIslands > settings.maxActiveIslands || pendingLoads > settings.maxPendingLoads;
  const criticalSample = frameMs >= settings.criticalFrameMs || overloaded;
  const healthySample = frameMs <= settings.targetFrameMs && !overloaded;
  const consecutiveCritical = criticalSample ? finite(prior.consecutiveCritical, 0) + 1 : 0;
  const consecutiveHealthy = healthySample ? finite(prior.consecutiveHealthy, 0) + 1 : 0;

  let mode = ['normal', 'degraded', 'critical'].includes(prior.mode) ? prior.mode : 'normal';
  if (consecutiveCritical >= settings.criticalSamples) mode = 'critical';
  else if (averageFrameMs >= settings.degradedFrameMs || overloaded) mode = 'degraded';
  else if (consecutiveHealthy >= settings.recoverySamples) mode = 'normal';

  const changed = mode !== prior.mode;
  const quality = mode === 'critical'
    ? Object.freeze({ islandRadiusScale: 0.55, ambientDensityScale: 0.35, shadowScale: 0.5 })
    : mode === 'degraded'
      ? Object.freeze({ islandRadiusScale: 0.78, ambientDensityScale: 0.65, shadowScale: 0.75 })
      : Object.freeze({ islandRadiusScale: 1, ambientDensityScale: 1, shadowScale: 1 });

  const telemetry = Object.freeze({
    mode,
    frameMs: Number(frameMs.toFixed(2)),
    averageFrameMs: Number(averageFrameMs.toFixed(2)),
    activeIslands,
    pendingLoads,
    overloaded,
    changed,
    sampleCount: recent.length,
    transitionCount: Math.round(finite(prior.transitionCount, 0)) + Number(changed),
  });

  return Object.freeze({
    mode,
    recentFrameMs: Object.freeze(recent),
    consecutiveCritical,
    consecutiveHealthy,
    transitionCount: telemetry.transitionCount,
    quality,
    telemetry,
  });
}
