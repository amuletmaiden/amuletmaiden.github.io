const TAKEOFF_LIFT_SECONDS = 0.46;
const PEAK_LIFT = 11.5;
const END_LIFT = 2.2;

export function deriveTakeoffLift({ active = false, elapsed = 0 } = {}) {
  if (!active || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TAKEOFF_LIFT_SECONDS) return 0;

  const progress = clamp(elapsed / TAKEOFF_LIFT_SECONDS, 0, 1);
  // Ease out quickly enough to make liftoff decisive, while avoiding a one-frame
  // velocity injection and yielding smoothly back to ordinary climb authority.
  const release = (1 - progress) * (1 - progress);
  return END_LIFT + (PEAK_LIFT - END_LIFT) * release;
}

export function advanceTakeoffLiftElapsed({ active = false, elapsed = 0, dt = 0 } = {}) {
  if (!active || !Number.isFinite(elapsed) || elapsed < 0) return TAKEOFF_LIFT_SECONDS;
  const frame = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  return Math.min(TAKEOFF_LIFT_SECONDS, elapsed + frame);
}

export const TAKEOFF_LIFT_DURATION = TAKEOFF_LIFT_SECONDS;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
