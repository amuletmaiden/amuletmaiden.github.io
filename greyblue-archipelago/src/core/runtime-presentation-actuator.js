function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeStreaming(profile) {
  const activateRange = Math.round(clamp(finite(profile?.streaming?.activateRange, 2400), 900, 2400));
  const deactivateRange = Math.round(clamp(
    Math.max(activateRange + 300, finite(profile?.streaming?.deactivateRange, 3000)),
    1200,
    3000,
  ));
  return Object.freeze({ activateRange, deactivateRange });
}

function safeRenderer(profile, devicePixelRatio) {
  const requestedPixelRatio = clamp(finite(profile?.renderer?.pixelRatio, devicePixelRatio), 0.5, 2);
  const shadowsEnabled = Boolean(profile?.renderer?.shadowsEnabled);
  const shadowMapSize = shadowsEnabled
    ? Math.round(clamp(finite(profile?.renderer?.shadowMapSize, 1024), 512, 2048))
    : 0;
  return Object.freeze({
    pixelRatio: Number(requestedPixelRatio.toFixed(2)),
    shadowsEnabled,
    shadowMapSize,
  });
}

function safeAtmosphere(profile) {
  return Object.freeze({
    ambientDensity: Number(clamp(finite(profile?.atmosphere?.ambientDensity, 1), 0, 1).toFixed(3)),
    ambientDensityScale: Number(clamp(finite(profile?.atmosphere?.ambientDensityScale, 1), 0, 1).toFixed(3)),
  });
}

export function createRuntimePresentationActuatorState() {
  return Object.freeze({
    mode: 'normal',
    pixelRatio: null,
    shadowsEnabled: null,
    shadowMapSize: null,
    applicationCount: 0,
    changeCount: 0,
  });
}

export function applyRuntimePresentation({
  renderer,
  shadowLight,
  profile,
  previous,
  devicePixelRatio = 1,
} = {}) {
  const prior = previous && typeof previous === 'object'
    ? previous
    : createRuntimePresentationActuatorState();
  const mode = ['normal', 'degraded', 'critical'].includes(profile?.mode)
    ? profile.mode
    : 'normal';
  const streaming = safeStreaming(profile);
  const rendererSettings = safeRenderer(profile, devicePixelRatio);
  const atmosphere = safeAtmosphere(profile);
  const changes = [];

  if (renderer && typeof renderer.setPixelRatio === 'function'
    && prior.pixelRatio !== rendererSettings.pixelRatio) {
    renderer.setPixelRatio(rendererSettings.pixelRatio);
    changes.push('pixel-ratio');
  }

  if (renderer?.shadowMap && prior.shadowsEnabled !== rendererSettings.shadowsEnabled) {
    renderer.shadowMap.enabled = rendererSettings.shadowsEnabled;
    changes.push('shadows-enabled');
  }

  if (shadowLight?.shadow?.mapSize && rendererSettings.shadowsEnabled
    && prior.shadowMapSize !== rendererSettings.shadowMapSize) {
    shadowLight.shadow.mapSize.set(rendererSettings.shadowMapSize, rendererSettings.shadowMapSize);
    if (shadowLight.shadow.map && typeof shadowLight.shadow.map.dispose === 'function') {
      shadowLight.shadow.map.dispose();
      shadowLight.shadow.map = null;
    }
    shadowLight.shadow.needsUpdate = true;
    changes.push('shadow-map-size');
  }

  const applicationCount = Math.round(finite(prior.applicationCount, 0)) + 1;
  const changeCount = Math.round(finite(prior.changeCount, 0)) + changes.length;
  const state = Object.freeze({
    mode,
    pixelRatio: rendererSettings.pixelRatio,
    shadowsEnabled: rendererSettings.shadowsEnabled,
    shadowMapSize: rendererSettings.shadowMapSize,
    applicationCount,
    changeCount,
  });

  return Object.freeze({
    state,
    streaming,
    renderer: rendererSettings,
    atmosphere,
    telemetry: Object.freeze({
      mode,
      applied: Boolean(renderer),
      changes: Object.freeze(changes),
      applicationCount,
      changeCount,
      traversalPreserved: true,
      controlsPreserved: true,
      savesPreserved: true,
    }),
  });
}
