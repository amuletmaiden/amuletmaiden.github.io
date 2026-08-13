const MAX_CURRENT_SPEED = 4.2;
const FULL_AUTHORITY_SPEED = 24;
const MIN_AUTHORITY_SPEED = 12;
const TRANSITION_TIME_SECONDS = 0.42;
const TRANSITION_EPSILON = 0.015;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function neutral() {
  return Object.freeze({ active: false, x: 0, z: 0 });
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

export function createRegionalAirCurrentTransition(initialCurrent = null) {
  const x = finiteOrZero(initialCurrent?.x);
  const z = finiteOrZero(initialCurrent?.z);
  return Object.freeze({ x, z, transitioning: false });
}

export function stepRegionalAirCurrentTransition({
  state = null,
  targetCurrent = null,
  dt = 0,
  interrupted = false,
} = {}) {
  if (interrupted) return createRegionalAirCurrentTransition();

  const previousX = finiteOrZero(state?.x);
  const previousZ = finiteOrZero(state?.z);
  const targetX = finiteOrZero(targetCurrent?.x);
  const targetZ = finiteOrZero(targetCurrent?.z);
  const seconds = clamp(finiteOrZero(dt), 0, 0.1);
  const alpha = seconds > 0 ? 1 - Math.exp(-seconds / TRANSITION_TIME_SECONDS) : 0;

  let x = previousX + (targetX - previousX) * alpha;
  let z = previousZ + (targetZ - previousZ) * alpha;
  const remaining = Math.hypot(targetX - x, targetZ - z);
  if (remaining <= TRANSITION_EPSILON) {
    x = targetX;
    z = targetZ;
  }

  return Object.freeze({
    x,
    z,
    transitioning: Math.hypot(targetX - x, targetZ - z) > TRANSITION_EPSILON,
  });
}

export function regionalAirCurrentTransitionPublicState(state = null) {
  const x = finiteOrZero(state?.x);
  const z = finiteOrZero(state?.z);
  return Object.freeze({
    active: Math.hypot(x, z) >= TRANSITION_EPSILON,
    transitioning: state?.transitioning === true,
  });
}

export const REGIONAL_AIR_CURRENT_MAX_SPEED = MAX_CURRENT_SPEED;
