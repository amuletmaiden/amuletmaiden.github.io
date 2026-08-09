const FOCUS_ORDER = Object.freeze(['safety', 'landing', 'interaction', 'crossing', 'guidance', 'expedition', 'flight']);
const SURFACE_IDS = Object.freeze(['flight', 'landing', 'interaction', 'crossing', 'guidance', 'expedition']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => value === true;

function normalizeSurfaces(surfaces = {}) {
  return Object.freeze({
    error: truthy(surfaces?.error),
    landing: truthy(surfaces?.landing),
    interaction: truthy(surfaces?.interaction),
    crossing: truthy(surfaces?.crossing),
    guidance: truthy(surfaces?.guidance),
    expedition: truthy(surfaces?.expedition),
    journalOpen: truthy(surfaces?.journalOpen),
  });
}

function safetyActive(state = {}, surfaces = {}) {
  if (surfaces.error || state?.collision?.requiresRecovery === true) return true;
  const stallFactor = Math.max(0, Math.min(1, finite(state?.flight?.stallFactor)));
  if (stallFactor >= 0.55) return true;

  const airborne = state?.flight?.airborne !== false;
  const altitude = finite(state?.position?.y);
  const surfaceHeight = finite(state?.surface?.height);
  const clearance = Math.max(0, altitude - surfaceHeight);
  const verticalSpeed = finite(state?.flight?.velocity?.y);
  return airborne && clearance < 18 && verticalSpeed < -3;
}

export function deriveContextualHudFocus({ state = {}, surfaces = {}, density = 'focused' } = {}) {
  const visible = normalizeSurfaces(surfaces);
  const mode = density === 'expanded' ? 'expanded' : 'focused';
  const safety = safetyActive(state, visible);

  const candidates = Object.freeze({
    safety,
    landing: visible.landing,
    interaction: visible.interaction,
    crossing: visible.crossing,
    guidance: visible.guidance,
    expedition: visible.expedition,
    flight: true,
  });

  const focus = FOCUS_ORDER.find((id) => candidates[id]) ?? 'flight';
  const dimmed = mode === 'expanded'
    ? []
    : SURFACE_IDS.filter((id) => id !== focus && !(id === 'flight' && safety));

  if (visible.journalOpen) {
    const journalIndex = dimmed.indexOf('journal');
    if (journalIndex >= 0) dimmed.splice(journalIndex, 1);
  }

  return Object.freeze({
    focus,
    density: mode,
    safety,
    journalOpen: visible.journalOpen,
    dimmedSurfaceIds: Object.freeze([...dimmed]),
    telemetry: Object.freeze({ focus, density: mode }),
  });
}
