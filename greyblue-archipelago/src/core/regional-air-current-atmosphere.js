const MIN_CURRENT_MAGNITUDE = 0.65;
const MAX_VISUAL_INTENSITY = 1;
const INACTIVE = Object.freeze({ active: false, directionX: 0, directionZ: 0, intensity: 0 });

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveRegionalAirCurrentAtmosphere({
  airCurrent = null,
  ready = false,
  paused = false,
  reducedMotion = false,
  flight = null,
  collision = null,
} = {}) {
  if (!ready || paused || reducedMotion) return INACTIVE;
  if (flight?.airborne !== true || flight?.landingRequested === true) return INACTIVE;
  if (collision?.grounded === true || collision?.requiresRecovery === true) return INACTIVE;

  const speed = finite(flight?.speed);
  const stallFactor = finite(flight?.stallFactor);
  const x = finite(airCurrent?.x);
  const z = finite(airCurrent?.z);
  if (speed === null || speed < 24 || stallFactor === null || stallFactor > 0.35 || x === null || z === null) return INACTIVE;

  const magnitude = Math.hypot(x, z);
  if (!Number.isFinite(magnitude) || magnitude < MIN_CURRENT_MAGNITUDE) return INACTIVE;

  const intensity = Math.min(MAX_VISUAL_INTENSITY, Math.max(0.24, magnitude / 4.2));
  return Object.freeze({
    active: true,
    directionX: x / magnitude,
    directionZ: z / magnitude,
    intensity,
  });
}

export function regionalAirCurrentAtmospherePublicState(cue = null) {
  return Object.freeze({ active: cue?.active === true });
}
