const VERBOSITY = new Set(["off", "minimal", "standard"]);
const CADENCE = Object.freeze({
  off: Number.POSITIVE_INFINITY,
  minimal: 8000,
  standard: 2500,
});

export function planGuidancePresentation(input = {}) {
  const settings = normalizeSettings(input.settings);
  const guidance = normalizeGuidance(input.guidance);
  const nowMs = boundedFinite(input.nowMs, 0, 0, Number.MAX_SAFE_INTEGER);
  const previous = normalizePrevious(input.previousPresentation);

  if (settings.verbosity === "off" || !guidance.destination) {
    return freeze({
      settings,
      visual: null,
      announcement: null,
      soundHookId: null,
      state: freeze({
        lastAnnouncementId: previous.lastAnnouncementId,
        lastAnnouncementAtMs: previous.lastAnnouncementAtMs,
      }),
      telemetry: freeze({
        reason: settings.verbosity === "off" ? "guidance-off" : "no-destination",
        suppressed: false,
        recoveredSettings: settings.recovered,
      }),
    });
  }

  const visual = freeze({
    destinationId: guidance.destination.id,
    distanceBand: guidance.destination.distanceBand,
    phase: guidance.destination.phase,
    bearingDegrees: guidance.destination.bearingDegrees,
    motion: settings.reducedMotion ? "none" : guidance.destination.motion,
    detail: settings.verbosity,
  });

  const candidate = guidance.announcement;
  const cadenceMs = CADENCE[settings.verbosity];
  const duplicate = candidate && candidate.id === previous.lastAnnouncementId;
  const withinCadence = candidate && nowMs - previous.lastAnnouncementAtMs < cadenceMs;
  const semanticAllowed = settings.verbosity === "standard" || candidate?.kind === "arrived";
  const announcement = candidate && !duplicate && !withinCadence && semanticAllowed
    ? freeze({
        id: candidate.id,
        destinationId: candidate.destinationId,
        kind: candidate.kind,
        live: "polite",
      })
    : null;

  const state = announcement
    ? freeze({ lastAnnouncementId: announcement.id, lastAnnouncementAtMs: nowMs })
    : freeze({
        lastAnnouncementId: previous.lastAnnouncementId,
        lastAnnouncementAtMs: previous.lastAnnouncementAtMs,
      });

  return freeze({
    settings,
    visual,
    announcement,
    soundHookId: settings.soundEnabled && semanticAllowed ? guidance.destination.soundHookId : null,
    state,
    telemetry: freeze({
      reason: announcement ? "announced" : "presented",
      suppressed: Boolean(candidate && !announcement),
      duplicateSuppressed: Boolean(duplicate),
      cadenceSuppressed: Boolean(withinCadence && !duplicate),
      verbositySuppressed: Boolean(candidate && !semanticAllowed),
      recoveredSettings: settings.recovered,
    }),
  });
}

export function normalizeGuidanceSettings(value = {}) {
  return normalizeSettings(value);
}

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const requestedVerbosity = text(source.verbosity);
  const verbosity = VERBOSITY.has(requestedVerbosity) ? requestedVerbosity : "standard";
  const reducedMotion = Boolean(source.reducedMotion);
  const soundEnabled = source.soundEnabled !== false;
  return freeze({
    verbosity,
    reducedMotion,
    soundEnabled,
    recovered: requestedVerbosity !== null && requestedVerbosity !== verbosity,
  });
}

function normalizeGuidance(value) {
  if (!value || typeof value !== "object") return freeze({ destination: null, announcement: null });
  const destination = value.destination && typeof value.destination === "object"
    ? freeze({
        id: text(value.destination.id),
        distanceBand: text(value.destination.distanceBand) ?? "far",
        phase: text(value.destination.phase) ?? "en-route",
        bearingDegrees: boundedFinite(value.destination.bearingDegrees, 0, 0, 359.999),
        motion: text(value.destination.motion) ?? "subtle",
        soundHookId: text(value.destination.soundHookId),
      })
    : null;
  const announcement = value.announcement && typeof value.announcement === "object"
    ? freeze({
        id: text(value.announcement.id),
        destinationId: text(value.announcement.destinationId),
        kind: text(value.announcement.kind),
      })
    : null;
  return freeze({ destination: destination?.id ? destination : null, announcement: announcement?.id ? announcement : null });
}

function normalizePrevious(value) {
  const source = value && typeof value === "object" ? value : {};
  return freeze({
    lastAnnouncementId: text(source.lastAnnouncementId),
    lastAnnouncementAtMs: boundedFinite(source.lastAnnouncementAtMs, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER),
  });
}

function boundedFinite(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
