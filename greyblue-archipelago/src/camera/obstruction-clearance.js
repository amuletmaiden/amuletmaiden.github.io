const DEFAULTS = Object.freeze({
  minDistance: 2.5,
  maxDistance: 14,
  retractRate: 24,
  releaseRate: 7,
  obstructionPadding: 0.45,
  clearFramesToRelease: 4,
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createObstructionState(distance = DEFAULTS.maxDistance) {
  return Object.freeze({ distance: finite(distance, DEFAULTS.maxDistance), obstructed: false, clearFrames: 0 });
}

export function resolveCameraObstruction(input = {}, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const previous = input.previous ?? createObstructionState(cfg.maxDistance);
  const desiredDistance = clamp(finite(input.desiredDistance, cfg.maxDistance), cfg.minDistance, cfg.maxDistance);
  const dt = clamp(finite(input.dt, 1 / 60), 1 / 240, 0.25);
  const hitDistance = finite(input.hitDistance, Number.POSITIVE_INFINITY);
  const validHit = input.obstructed === true && Number.isFinite(input.hitDistance);
  const fallbackUsed = input.obstructed === true && !validHit;

  let target = desiredDistance;
  let obstructed = validHit;
  let clearFrames = validHit ? 0 : Math.min(cfg.clearFramesToRelease, finite(previous.clearFrames) + 1);

  if (validHit) {
    target = clamp(hitDistance - cfg.obstructionPadding, cfg.minDistance, desiredDistance);
  } else if (previous.obstructed && clearFrames < cfg.clearFramesToRelease) {
    target = Math.min(desiredDistance, finite(previous.distance, desiredDistance));
    obstructed = true;
  }

  const current = clamp(finite(previous.distance, desiredDistance), cfg.minDistance, cfg.maxDistance);
  const rate = target < current ? cfg.retractRate : cfg.releaseRate;
  const maxStep = Math.max(0, rate * dt);
  const distance = current + clamp(target - current, -maxStep, maxStep);

  const result = {
    distance: clamp(distance, cfg.minDistance, cfg.maxDistance),
    obstructed,
    clearFrames,
  };

  return Object.freeze({
    state: Object.freeze(result),
    telemetry: Object.freeze({
      obstructed,
      retractDistance: Math.max(0, desiredDistance - result.distance),
      targetDistance: target,
      fallbackUsed,
    }),
  });
}

export { DEFAULTS as OBSTRUCTION_CLEARANCE_DEFAULTS };
