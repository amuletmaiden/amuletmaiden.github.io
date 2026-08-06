const MODES = new Set(['off', 'minimal', 'standard']);
const PHASE_LABELS = Object.freeze({
  'en-route': 'En route',
  approach: 'Approaching',
  arrived: 'Arrived',
});
const DISTANCE_LABELS = Object.freeze({
  far: 'Far',
  mid: 'Mid-distance',
  near: 'Near',
  arrival: 'Here',
});

export function presentDestinationGuidance(input = {}) {
  const guidance = normalizeGuidance(input.guidance);
  const mount = normalizeMountState(input.mountState);
  const previous = normalizePrevious(input.previousPresentation);
  const viewportWidth = boundedFinite(input.viewportWidth, mount.viewportWidth, 0, 16384);
  const compact = viewportWidth < 560;
  const mode = mount.settings.mode;

  if (mode === 'off') {
    return freeze({
      visible: false,
      destination: null,
      label: null,
      keyboardText: 'Destination guidance off.',
      announcement: null,
      soundHookId: null,
      motion: 'none',
      state: freeze({ signature: 'off', announcementId: previous.announcementId }),
      telemetry: freeze({ reason: 'guidance-off', changed: previous.signature !== 'off', compact, recovered: mount.recovered }),
    });
  }

  if (!guidance.destination) {
    const signature = 'no-destination';
    return freeze({
      visible: false,
      destination: null,
      label: null,
      keyboardText: 'No destination selected.',
      announcement: null,
      soundHookId: null,
      motion: 'none',
      state: freeze({ signature, announcementId: previous.announcementId }),
      telemetry: freeze({ reason: 'no-destination', changed: signature !== previous.signature, compact, recovered: true }),
    });
  }

  const destination = guidance.destination;
  const phase = destination.phase;
  const arrivalOnly = mode === 'minimal';
  const visible = !arrivalOnly || phase === 'arrived';
  const bearing = relativeBearing(destination.bearingDegrees, input.headingDegrees);
  const bearingLabel = bearingText(bearing, compact);
  const distanceLabel = DISTANCE_LABELS[destination.distanceBand] ?? DISTANCE_LABELS.far;
  const phaseLabel = PHASE_LABELS[phase] ?? PHASE_LABELS['en-route'];
  const name = destination.name ?? destination.id;
  const label = visible
    ? compact
      ? `${name} · ${bearingLabel} · ${distanceLabel}`
      : `${name} — ${phaseLabel}, ${bearingLabel}, ${distanceLabel.toLowerCase()}`
    : null;
  const keyboardText = visible
    ? `${name}. ${phaseLabel}. ${bearingLabel}. ${distanceLabel}.`
    : `${name}. Guidance is set to arrival only.`;
  const signature = [mode, destination.id, phase, destination.distanceBand, bearingLabel, compact ? 'compact' : 'wide'].join(':');

  const candidate = normalizeAnnouncement(guidance.announcement);
  const announcementAllowed = candidate && (mode === 'standard' || candidate.kind === 'arrived');
  const duplicate = announcementAllowed && candidate.id === previous.announcementId;
  const announcement = announcementAllowed && !duplicate
    ? freeze({
        id: candidate.id,
        text: candidate.kind === 'arrived' ? `${name} reached.` : `Approaching ${name}.`,
        live: 'polite',
      })
    : null;

  return freeze({
    visible,
    destination: freeze({
      id: destination.id,
      name,
      phase,
      distanceBand: destination.distanceBand,
      relativeBearingDegrees: bearing,
      bearingLabel,
    }),
    label,
    keyboardText,
    announcement,
    soundHookId: mount.settings.soundEnabled && (mode === 'standard' || phase === 'arrived')
      ? destination.soundHookId
      : null,
    motion: mount.settings.reducedMotion ? 'none' : destination.motion,
    state: freeze({
      signature,
      announcementId: announcement?.id ?? previous.announcementId,
    }),
    telemetry: freeze({
      reason: visible ? 'presented' : 'arrival-only',
      changed: signature !== previous.signature,
      duplicateSuppressed: Boolean(duplicate),
      compact,
      recovered: mount.recovered || guidance.recovered,
    }),
  });
}

function normalizeGuidance(value) {
  if (!value || typeof value !== 'object') return freeze({ destination: null, announcement: null, recovered: true });
  const source = value.destination;
  if (!source || typeof source !== 'object') return freeze({ destination: null, announcement: null, recovered: false });
  const id = text(source.id);
  if (!id) return freeze({ destination: null, announcement: null, recovered: true });
  return freeze({
    destination: freeze({
      id,
      name: text(source.name),
      bearingDegrees: boundedFinite(source.bearingDegrees, 0, 0, 359.999),
      distanceBand: text(source.distanceBand) ?? 'far',
      phase: text(source.phase) ?? 'en-route',
      motion: text(source.motion) ?? 'subtle',
      soundHookId: text(source.soundHookId),
    }),
    announcement: value.announcement,
    recovered: false,
  });
}

function normalizeMountState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawSettings = source.session?.settings ?? source.settings ?? {};
  const requestedMode = text(rawSettings.mode ?? rawSettings.verbosity);
  const mode = MODES.has(requestedMode) ? requestedMode : 'standard';
  return freeze({
    viewportWidth: boundedFinite(source.viewportWidth, 1280, 0, 16384),
    settings: freeze({
      mode,
      reducedMotion: rawSettings.reducedMotion === true,
      soundEnabled: rawSettings.soundEnabled !== false,
    }),
    recovered: requestedMode !== null && requestedMode !== mode,
  });
}

function normalizePrevious(value) {
  const source = value && typeof value === 'object' ? value : {};
  return freeze({ signature: text(source.signature), announcementId: text(source.announcementId) });
}

function normalizeAnnouncement(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id);
  const kind = text(value.kind);
  return id && kind ? freeze({ id, kind }) : null;
}

function relativeBearing(destination, heading) {
  const normalizedHeading = boundedFinite(heading, 0, -360000, 360000);
  return ((destination - normalizedHeading + 540) % 360) - 180;
}

function bearingText(value, compact) {
  const magnitude = Math.abs(value);
  if (magnitude < 12) return compact ? 'Ahead' : 'Straight ahead';
  if (magnitude > 168) return 'Behind';
  const side = value < 0 ? 'Left' : 'Right';
  if (compact) return side;
  if (magnitude < 55) return `Slight ${side.toLowerCase()}`;
  if (magnitude < 125) return side;
  return `Hard ${side.toLowerCase()}`;
}

function boundedFinite(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
