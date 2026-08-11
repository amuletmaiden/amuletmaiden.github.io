const RISE_RESPONSE = 5.5;
const RELEASE_RESPONSE = 9;
const MAX_DISTANCE_CONTRACTION = 2;
const MAX_HEIGHT_CONTRACTION = 1.5;
const MAX_LOOK_AHEAD_CONTRACTION = 3;

export function createGroundedCameraSettleState() {
  return Object.freeze({ blend: 0 });
}

export function stepGroundedCameraSettle(
  state = createGroundedCameraSettleState(),
  frame = {},
) {
  const prior = finiteBlend(state?.blend);
  const dt = clamp(Number(frame?.dt) || 0, 0, 0.1);
  const grounded = frame?.grounded === true;
  const response = grounded ? RISE_RESPONSE : RELEASE_RESPONSE;
  const target = grounded ? 1 : 0;
  const amount = dt > 0 ? 1 - Math.exp(-response * dt) : 0;
  const blend = clamp(prior + (target - prior) * amount, 0, 1);
  return Object.freeze({ blend });
}

export function groundedCameraComposition(state = createGroundedCameraSettleState()) {
  const blend = finiteBlend(state?.blend);
  return Object.freeze({
    blend,
    speedScale: 1 - blend,
    bankScale: 1 - blend,
    distanceOffset: -MAX_DISTANCE_CONTRACTION * blend,
    heightOffset: -MAX_HEIGHT_CONTRACTION * blend,
    lookAheadOffset: -MAX_LOOK_AHEAD_CONTRACTION * blend,
  });
}

export function clearGroundedCameraSettle() {
  return createGroundedCameraSettleState();
}

function finiteBlend(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
