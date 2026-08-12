const MAX_PLANAR_SPEED = 72;
const MAX_VERTICAL_SPEED = 24;

export const NEUTRAL_FLIGHT_RESUME = Object.freeze({
  yaw: 0,
  velocity: Object.freeze({ x: 0, y: 0, z: 0 }),
  airborne: true,
  landingRequested: false,
});

export function normalizeFlightResume(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return cloneNeutral();
  }

  const airborne = candidate.airborne !== false;
  if (!airborne) {
    return {
      yaw: normalizeYaw(candidate.yaw),
      velocity: { x: 0, y: 0, z: 0 },
      airborne: false,
      landingRequested: false,
    };
  }

  const rawX = finiteOrZero(candidate.velocity?.x);
  const rawZ = finiteOrZero(candidate.velocity?.z);
  const planarSpeed = Math.hypot(rawX, rawZ);
  const planarScale = planarSpeed > MAX_PLANAR_SPEED && planarSpeed > 0
    ? MAX_PLANAR_SPEED / planarSpeed
    : 1;

  return {
    yaw: normalizeYaw(candidate.yaw),
    velocity: {
      x: rawX * planarScale,
      y: clamp(finiteOrZero(candidate.velocity?.y), -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED),
      z: rawZ * planarScale,
    },
    airborne: true,
    landingRequested: candidate.landingRequested === true,
  };
}

function normalizeYaw(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.atan2(Math.sin(numeric), Math.cos(numeric));
}

function finiteOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneNeutral() {
  return {
    yaw: NEUTRAL_FLIGHT_RESUME.yaw,
    velocity: { ...NEUTRAL_FLIGHT_RESUME.velocity },
    airborne: NEUTRAL_FLIGHT_RESUME.airborne,
    landingRequested: NEUTRAL_FLIGHT_RESUME.landingRequested,
  };
}
