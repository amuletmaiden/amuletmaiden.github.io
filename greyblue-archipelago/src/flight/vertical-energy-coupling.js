const DESCENT_DEAD_ZONE = 2;
const CLIMB_DEAD_ZONE = 2;
const DESCENT_RANGE = 12;
const CLIMB_RANGE = 12;
const CLIMB_SPEED_GATE_START = 18;
const CLIMB_SPEED_GATE_RANGE = 16;
const MAX_DIVE_GAIN = 5.5;
const MAX_CLIMB_TRADEOFF = 3.5;

export function deriveVerticalEnergySpeedBias({
  airborne,
  landingRequested = false,
  verticalVelocity,
  planarSpeed,
} = {}) {
  if (!airborne || landingRequested) return 0;

  const vertical = Number(verticalVelocity);
  const speed = Number(planarSpeed);
  if (!Number.isFinite(vertical) || !Number.isFinite(speed) || speed < 0) return 0;

  const descent = clamp((-vertical - DESCENT_DEAD_ZONE) / DESCENT_RANGE, 0, 1);
  const climb = clamp((vertical - CLIMB_DEAD_ZONE) / CLIMB_RANGE, 0, 1);
  const climbSpeedGate = clamp(
    (speed - CLIMB_SPEED_GATE_START) / CLIMB_SPEED_GATE_RANGE,
    0,
    1,
  );

  return descent * MAX_DIVE_GAIN - climb * climbSpeedGate * MAX_CLIMB_TRADEOFF;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
