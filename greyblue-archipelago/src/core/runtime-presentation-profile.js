const DEFAULT_STREAMING = Object.freeze({ activateRange: 2400, deactivateRange: 3000 });

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    streaming: Object.freeze({ ...profile.streaming }),
    renderer: Object.freeze({ ...profile.renderer }),
    atmosphere: Object.freeze({ ...profile.atmosphere }),
    telemetry: Object.freeze({ ...profile.telemetry }),
  });
}

export function createRuntimePresentationProfile({
  health,
  baseStreaming = DEFAULT_STREAMING,
  devicePixelRatio = 1,
  baseAmbientDensity = 1,
} = {}) {
  const mode = ['normal', 'degraded', 'critical'].includes(health?.mode)
    ? health.mode
    : 'normal';
  const quality = health?.quality && typeof health.quality === 'object'
    ? health.quality
    : {};

  const islandRadiusScale = clamp(finite(quality.islandRadiusScale, 1), 0.35, 1);
  const ambientDensityScale = clamp(finite(quality.ambientDensityScale, 1), 0, 1);
  const shadowScale = clamp(finite(quality.shadowScale, 1), 0, 1);
  const activateRange = clamp(
    finite(baseStreaming.activateRange, DEFAULT_STREAMING.activateRange) * islandRadiusScale,
    900,
    2400,
  );
  const baseDeactivateRange = Math.max(
    finite(baseStreaming.deactivateRange, DEFAULT_STREAMING.deactivateRange),
    finite(baseStreaming.activateRange, DEFAULT_STREAMING.activateRange) + 300,
  );
  const deactivateRange = clamp(
    Math.max(activateRange + 300, baseDeactivateRange * islandRadiusScale),
    1200,
    3000,
  );

  const requestedPixelRatio = clamp(finite(devicePixelRatio, 1), 0.5, 4);
  const pixelRatioCap = mode === 'critical' ? 1 : mode === 'degraded' ? 1.35 : 2;
  const pixelRatio = Math.min(requestedPixelRatio, pixelRatioCap);
  const shadowsEnabled = mode !== 'critical' && shadowScale >= 0.6;
  const shadowMapSize = shadowsEnabled
    ? (mode === 'degraded' ? 1024 : 2048)
    : 0;
  const ambientDensity = clamp(
    finite(baseAmbientDensity, 1) * ambientDensityScale,
    0,
    Math.max(0, finite(baseAmbientDensity, 1)),
  );

  return freezeProfile({
    mode,
    streaming: {
      activateRange: Math.round(activateRange),
      deactivateRange: Math.round(deactivateRange),
    },
    renderer: {
      pixelRatio: Number(pixelRatio.toFixed(2)),
      shadowsEnabled,
      shadowMapSize,
    },
    atmosphere: {
      ambientDensity: Number(ambientDensity.toFixed(3)),
      ambientDensityScale,
    },
    telemetry: {
      sourceMode: mode,
      islandRadiusScale,
      ambientDensityScale,
      shadowScale,
      traversalRangePreserved: true,
      controlsPreserved: true,
      savesPreserved: true,
      landmarksPreserved: true,
      mysteriesPreserved: true,
    },
  });
}
