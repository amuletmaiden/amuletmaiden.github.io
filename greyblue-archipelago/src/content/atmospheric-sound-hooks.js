const DEFAULT_CONFIG = Object.freeze({
  maxQueued: 4,
  minGapMs: 900,
  maxDurationMs: 12000,
  reducedMotionDurationScale: 0.75,
  degradedDensityScale: 0.6,
  criticalDensityScale: 0.3,
});

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanId(value, fallback = 'unknown') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 96) : fallback;
}

function densityScale(mode, config) {
  if (mode === 'critical') return config.criticalDensityScale;
  if (mode === 'degraded') return config.degradedDensityScale;
  return 1;
}

function normalizeCandidate(candidate, index, config) {
  if (!candidate || typeof candidate !== 'object') return null;
  const hookId = cleanId(candidate.hookId || candidate.id, `hook-${index}`);
  const priority = clamp(Math.trunc(finiteNumber(candidate.priority, 0)), -100, 100);
  const durationMs = clamp(
    Math.trunc(finiteNumber(candidate.durationMs, 1800)),
    100,
    config.maxDurationMs,
  );
  const gain = clamp(finiteNumber(candidate.gain, 1), 0, 1);
  const spatial = candidate.spatial !== false;
  return Object.freeze({ hookId, priority, durationMs, gain, spatial });
}

export function planAtmosphericSoundHooks(input = {}, previousState = {}, overrides = {}) {
  const config = Object.freeze({
    ...DEFAULT_CONFIG,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  });
  const nowMs = Math.max(0, finiteNumber(input.nowMs, 0));
  const soundEnabled = input.soundEnabled !== false;
  const reducedMotion = input.reducedMotion === true;
  const performanceMode = cleanId(input.performanceMode, 'normal');
  const scale = clamp(densityScale(performanceMode, config), 0, 1);
  const lastEmitMs = Math.max(0, finiteNumber(previousState.lastEmitMs, 0));
  const priorRecent = Array.isArray(previousState.recentHookIds)
    ? previousState.recentHookIds.map((id) => cleanId(id)).slice(-config.maxQueued)
    : [];

  const normalized = (Array.isArray(input.candidates) ? input.candidates : [])
    .map((candidate, index) => normalizeCandidate(candidate, index, config))
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority || a.hookId.localeCompare(b.hookId));

  const gapReady = nowMs - lastEmitMs >= Math.max(0, finiteNumber(config.minGapMs, DEFAULT_CONFIG.minGapMs));
  let selected = null;
  if (soundEnabled && gapReady && normalized.length > 0 && scale > 0) {
    const eligible = normalized.filter((candidate) => !priorRecent.includes(candidate.hookId));
    selected = eligible[0] || normalized[0];
  }

  const cue = selected
    ? Object.freeze({
        hookId: selected.hookId,
        durationMs: Math.max(
          100,
          Math.round(selected.durationMs * (reducedMotion ? config.reducedMotionDurationScale : 1)),
        ),
        gain: clamp(selected.gain * scale, 0, 1),
        spatial: selected.spatial,
      })
    : null;

  const recentHookIds = cue
    ? [...priorRecent.filter((id) => id !== cue.hookId), cue.hookId].slice(-config.maxQueued)
    : priorRecent;
  const state = Object.freeze({
    lastEmitMs: cue ? nowMs : lastEmitMs,
    recentHookIds: Object.freeze([...recentHookIds]),
  });
  const telemetry = Object.freeze({
    candidateCount: normalized.length,
    emitted: Boolean(cue),
    reason: cue
      ? 'emitted'
      : !soundEnabled
        ? 'sound-disabled'
        : !gapReady
          ? 'cooldown'
          : normalized.length === 0
            ? 'no-candidates'
            : 'performance-suppressed',
    performanceMode,
    densityScale: scale,
    reducedMotion,
  });

  return Object.freeze({ cue, state, telemetry });
}

export { DEFAULT_CONFIG as ATMOSPHERIC_SOUND_HOOK_DEFAULTS };
