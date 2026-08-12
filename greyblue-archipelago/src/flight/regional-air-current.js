const MAX_CURRENT_SPEED = 4.2;
const FULL_AUTHORITY_SPEED = 24;
const MIN_AUTHORITY_SPEED = 12;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function neutral() {
  return Object.freeze({ active: false, x: 0, z: 0 });
}

export function deriveRegionalAirCurrent({
  airCurrent = null,
  airborne = false,
  landingRequested = false,
  takeoffActive = false,
  stallFactor = 0,
  grounded = false,
  recovering = false,
  planarSpeed = 0,
} = {}) {
  if (!airborne || landingRequested || takeoffActive || grounded || recovering) return neutral();

  const speed = Number(planarSpeed);
  const stall = Number(stallFactor);
  const x = Number(airCurrent?.x);
  const z = Number(airCurrent?.z);
  if (![speed, stall, x, z].every(Number.isFinite)) return neutral();
  if (speed <= MIN_AUTHORITY_SPEED || stall > 0.35) return neutral();

  const magnitude = Math.hypot(x, z);
  if (magnitude <= 0) return neutral();

  const speedAuthority = clamp(
    (speed - MIN_AUTHORITY_SPEED) / (FULL_AUTHORITY_SPEED - MIN_AUTHORITY_SPEED),
    0,
    1,
  );
  const cappedMagnitude = Math.min(magnitude, MAX_CURRENT_SPEED) * speedAuthority;
  if (cappedMagnitude <= 0) return neutral();

  return Object.freeze({
    active: true,
    x: x / magnitude * cappedMagnitude,
    z: z / magnitude * cappedMagnitude,
  });
}

export const REGIONAL_AIR_CURRENT_MAX_SPEED = MAX_CURRENT_SPEED;
