const MAX_FLIGHT_PATH_PITCH_BIAS = 0.14;
const MIN_PATH_SPEED = 8;
const FULL_PATH_SPEED = 18;
const STALL_POSE_AUTHORITY = 0.35;
const INPUT_DEADZONE = 0.08;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function deriveFlightPathPitchBias({
  airborne = false,
  landingRequested = false,
  stallFactor = 0,
  climb = 0,
  planarSpeed = 0,
  verticalVelocity = 0,
} = {}) {
  if (airborne !== true || landingRequested === true) return 0;

  const speed = Math.max(0, finite(planarSpeed));
  const vertical = finite(verticalVelocity);
  const stall = clamp(finite(stallFactor), 0, 1);
  const explicitClimb = clamp(finite(climb), -1, 1);
  if (speed <= MIN_PATH_SPEED || stall >= STALL_POSE_AUTHORITY || Math.abs(vertical) < 0.05) return 0;

  const speedGate = clamp(
    (speed - MIN_PATH_SPEED) / Math.max(FULL_PATH_SPEED - MIN_PATH_SPEED, Number.EPSILON),
    0,
    1,
  );
  const pathAngle = Math.atan2(vertical, Math.max(speed, Number.EPSILON));
  let bias = clamp(pathAngle * 0.55, -MAX_FLIGHT_PATH_PITCH_BIAS, MAX_FLIGHT_PATH_PITCH_BIAS) * speedGate;

  if (Math.abs(explicitClimb) >= INPUT_DEADZONE && Math.sign(explicitClimb) !== Math.sign(bias)) {
    bias = 0;
  }
  return Number.isFinite(bias) ? bias : 0;
}

export const FLIGHT_PATH_PITCH_LIMITS = Object.freeze({
  maximumBias: MAX_FLIGHT_PATH_PITCH_BIAS,
  minimumSpeed: MIN_PATH_SPEED,
  fullSpeed: FULL_PATH_SPEED,
});
