const MIN_GROUND_RUSH_SPEED = 24;
const FULL_GROUND_RUSH_SPEED = 52;
const FULL_GROUND_RUSH_CLEARANCE = 14;
const MAX_GROUND_RUSH_CLEARANCE = 42;
const MAX_DISTANCE_CONTRACTION = 3.5;
const MAX_LOOK_AHEAD_GAIN = 4;
const REDUCED_MOTION_SCALE = 0.45;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function deriveGroundRushCameraComposition({
  speed = 0,
  clearance = Number.POSITIVE_INFINITY,
  grounded = false,
  obstructed = false,
  reducedMotion = false,
} = {}) {
  if (grounded === true || obstructed === true) return neutralComposition();

  const safeSpeed = Math.max(0, finite(speed));
  const safeClearance = finite(clearance, Number.POSITIVE_INFINITY);
  if (safeSpeed <= MIN_GROUND_RUSH_SPEED
    || !Number.isFinite(safeClearance)
    || safeClearance >= MAX_GROUND_RUSH_CLEARANCE) {
    return neutralComposition();
  }

  const speedGate = clamp(
    (safeSpeed - MIN_GROUND_RUSH_SPEED) / (FULL_GROUND_RUSH_SPEED - MIN_GROUND_RUSH_SPEED),
    0,
    1,
  );
  const clearanceGate = clamp(
    (MAX_GROUND_RUSH_CLEARANCE - safeClearance)
      / (MAX_GROUND_RUSH_CLEARANCE - FULL_GROUND_RUSH_CLEARANCE),
    0,
    1,
  );
  const accessibilityScale = reducedMotion === true ? REDUCED_MOTION_SCALE : 1;
  const strength = clamp(speedGate * clearanceGate * accessibilityScale, 0, 1);

  return Object.freeze({
    active: strength > 0,
    strength,
    distanceOffset: -MAX_DISTANCE_CONTRACTION * strength,
    lookAheadOffset: MAX_LOOK_AHEAD_GAIN * strength,
  });
}

function neutralComposition() {
  return Object.freeze({
    active: false,
    strength: 0,
    distanceOffset: 0,
    lookAheadOffset: 0,
  });
}

export const GROUND_RUSH_CAMERA_LIMITS = Object.freeze({
  minimumSpeed: MIN_GROUND_RUSH_SPEED,
  fullSpeed: FULL_GROUND_RUSH_SPEED,
  fullClearance: FULL_GROUND_RUSH_CLEARANCE,
  maximumClearance: MAX_GROUND_RUSH_CLEARANCE,
  maximumDistanceContraction: MAX_DISTANCE_CONTRACTION,
  maximumLookAheadGain: MAX_LOOK_AHEAD_GAIN,
  reducedMotionScale: REDUCED_MOTION_SCALE,
});
