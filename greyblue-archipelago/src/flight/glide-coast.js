const NEUTRAL_THROTTLE = 0.08;
const COAST_MIN_SPEED = 26;
const COAST_TARGET_SLIP = 1.75;

export function deriveGlideCoastTarget({
  airborne,
  landingRequested = false,
  takeoffActive = false,
  stallPressure = 0,
  throttle,
  planarSpeed,
  ordinaryTargetSpeed,
} = {}) {
  const input = Number(throttle);
  const speed = Number(planarSpeed);
  const ordinary = Number(ordinaryTargetSpeed);
  const stall = Number(stallPressure);

  if (!Number.isFinite(ordinary)) return 0;
  if (
    !airborne ||
    landingRequested ||
    takeoffActive ||
    !Number.isFinite(input) ||
    !Number.isFinite(speed) ||
    !Number.isFinite(stall) ||
    speed < 0 ||
    stall < 0 ||
    Math.abs(input) > NEUTRAL_THROTTLE ||
    stall > 0 ||
    speed < COAST_MIN_SPEED
  ) {
    return ordinary;
  }

  return Math.min(speed, Math.max(ordinary, speed - COAST_TARGET_SLIP));
}
