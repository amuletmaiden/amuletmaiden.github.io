const MIN_SPEED = 26;
const FULL_SPEED = 54;
const MIN_CLEARANCE = 8;
const FULL_CLEARANCE = 24;
const MAX_CLEARANCE = 70;
const MIN_RISE = 3;
const FULL_RISE = 14;
const MAX_VERTICAL_BIAS = 2.8;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function deriveRidgeLift({
  speed = 0,
  clearance = Number.POSITIVE_INFINITY,
  terrainRise = 0,
  airborne = false,
  grounded = false,
  landing = false,
  recovering = false,
  restoring = false,
} = {}) {
  if (airborne !== true || grounded === true || landing === true || recovering === true || restoring === true) {
    return neutral();
  }

  const safeSpeed = Math.max(0, finite(speed));
  const safeClearance = finite(clearance, Number.POSITIVE_INFINITY);
  const safeRise = finite(terrainRise);
  if (!Number.isFinite(safeClearance)
    || safeSpeed <= MIN_SPEED
    || safeClearance <= MIN_CLEARANCE
    || safeClearance >= MAX_CLEARANCE
    || safeRise <= MIN_RISE) {
    return neutral();
  }

  const speedGate = clamp((safeSpeed - MIN_SPEED) / (FULL_SPEED - MIN_SPEED), 0, 1);
  const riseGate = clamp((safeRise - MIN_RISE) / (FULL_RISE - MIN_RISE), 0, 1);
  const clearanceGate = safeClearance <= FULL_CLEARANCE
    ? clamp((safeClearance - MIN_CLEARANCE) / (FULL_CLEARANCE - MIN_CLEARANCE), 0, 1)
    : clamp((MAX_CLEARANCE - safeClearance) / (MAX_CLEARANCE - FULL_CLEARANCE), 0, 1);
  const strength = clamp(speedGate * riseGate * clearanceGate, 0, 1);
  const verticalBias = MAX_VERTICAL_BIAS * strength;

  return Object.freeze({ active: strength > 0, strength, verticalBias });
}

function neutral() {
  return Object.freeze({ active: false, strength: 0, verticalBias: 0 });
}

export const RIDGE_LIFT_LIMITS = Object.freeze({
  minimumSpeed: MIN_SPEED,
  fullSpeed: FULL_SPEED,
  minimumClearance: MIN_CLEARANCE,
  fullClearance: FULL_CLEARANCE,
  maximumClearance: MAX_CLEARANCE,
  minimumRise: MIN_RISE,
  fullRise: FULL_RISE,
  maximumVerticalBias: MAX_VERTICAL_BIAS,
});
