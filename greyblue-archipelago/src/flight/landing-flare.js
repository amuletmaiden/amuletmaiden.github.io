const BASE_LANDING_DESCENT = -6.5;
const SOFTEST_FLARE_DESCENT = -2.6;
const FLARE_DEADZONE = 0.08;

export function deriveLandingVerticalTarget({
  airborne,
  landingRequested,
  takeoffActive = false,
  climb,
  ordinaryTargetVertical,
} = {}) {
  const input = Number(climb);
  const ordinary = Number(ordinaryTargetVertical);

  if (
    !airborne
    || !landingRequested
    || takeoffActive
    || !Number.isFinite(input)
    || !Number.isFinite(ordinary)
  ) {
    return ordinary;
  }

  const positiveClimb = clamp((input - FLARE_DEADZONE) / (1 - FLARE_DEADZONE), 0, 1);
  const flareTarget = BASE_LANDING_DESCENT
    + (SOFTEST_FLARE_DESCENT - BASE_LANDING_DESCENT) * positiveClimb;

  return Math.min(ordinary, flareTarget);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export { BASE_LANDING_DESCENT, SOFTEST_FLARE_DESCENT };
