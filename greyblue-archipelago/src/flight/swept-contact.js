const DEFAULTS = Object.freeze({
  maxStepDistance: 2.5,
  maxSamples: 32,
  clearance: 0.2,
  waterClearance: 0.05,
  minimumNormalY: 0.05,
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const vector = (value = {}) => ({
  x: finite(value.x),
  y: finite(value.y),
  z: finite(value.z),
});
const freezeVector = (value) => Object.freeze({ x: value.x, y: value.y, z: value.z });

function normalize(value, fallback = { x: 0, y: 1, z: 0 }) {
  const candidate = vector(value);
  const length = Math.hypot(candidate.x, candidate.y, candidate.z);
  if (!(length > 0)) return { ...fallback };
  return { x: candidate.x / length, y: candidate.y / length, z: candidate.z / length };
}

function sampleSurface(sampleTerrain, point, fallbackHeight) {
  if (typeof sampleTerrain !== 'function') {
    return { height: fallbackHeight, normal: { x: 0, y: 1, z: 0 }, valid: false };
  }

  try {
    const sample = sampleTerrain(Object.freeze({ ...point })) ?? {};
    return {
      height: finite(sample.height, fallbackHeight),
      normal: normalize(sample.normal),
      valid: Number.isFinite(sample.height),
    };
  } catch {
    return { height: fallbackHeight, normal: { x: 0, y: 1, z: 0 }, valid: false };
  }
}

export function sweepContact(input = {}, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const start = vector(input.start);
  const end = vector(input.end);
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  const maxStepDistance = clamp(finite(cfg.maxStepDistance, DEFAULTS.maxStepDistance), 0.1, 100);
  const maxSamples = Math.floor(clamp(finite(cfg.maxSamples, DEFAULTS.maxSamples), 1, 256));
  const requestedSamples = Math.max(1, Math.ceil(distance / maxStepDistance));
  const sampleCount = Math.min(maxSamples, requestedSamples);
  const clearance = clamp(finite(cfg.clearance, DEFAULTS.clearance), 0, 20);
  const waterClearance = clamp(finite(cfg.waterClearance, DEFAULTS.waterClearance), 0, 20);
  const waterHeight = Number.isFinite(input.waterHeight) ? input.waterHeight : null;
  const fallbackTerrainHeight = finite(input.fallbackTerrainHeight, -Infinity);

  let fallbackCount = 0;
  let previousT = 0;
  let previousPoint = start;
  let previousGround = sampleSurface(input.sampleTerrain, start, fallbackTerrainHeight);
  if (!previousGround.valid) fallbackCount += 1;

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const point = {
      x: start.x + delta.x * t,
      y: start.y + delta.y * t,
      z: start.z + delta.z * t,
    };
    const terrain = sampleSurface(input.sampleTerrain, point, fallbackTerrainHeight);
    if (!terrain.valid) fallbackCount += 1;

    const terrainLimit = terrain.height + clearance;
    const waterLimit = waterHeight === null ? -Infinity : waterHeight + waterClearance;
    const terrainHit = point.y <= terrainLimit;
    const waterHit = point.y <= waterLimit;

    if (terrainHit || waterHit) {
      const hitKind = terrainHit && (!waterHit || terrainLimit >= waterLimit) ? 'terrain' : 'water';
      const limit = hitKind === 'terrain' ? terrainLimit : waterLimit;
      const previousLimit = hitKind === 'terrain'
        ? previousGround.height + clearance
        : waterLimit;
      const previousGap = previousPoint.y - previousLimit;
      const currentGap = point.y - limit;
      const denominator = previousGap - currentGap;
      const localFraction = denominator > 0 ? clamp(previousGap / denominator, 0, 1) : 1;
      const fraction = previousT + (t - previousT) * localFraction;
      const hitPoint = {
        x: start.x + delta.x * fraction,
        y: start.y + delta.y * fraction,
        z: start.z + delta.z * fraction,
      };
      const normal = hitKind === 'terrain'
        ? normalize(terrain.normal)
        : { x: 0, y: 1, z: 0 };
      if (normal.y < clamp(finite(cfg.minimumNormalY, DEFAULTS.minimumNormalY), -1, 1)) {
        normal.y = clamp(finite(cfg.minimumNormalY, DEFAULTS.minimumNormalY), -1, 1);
        const adjusted = normalize(normal);
        normal.x = adjusted.x;
        normal.y = adjusted.y;
        normal.z = adjusted.z;
      }

      return Object.freeze({
        hit: true,
        kind: hitKind,
        fraction,
        point: freezeVector(hitPoint),
        normal: freezeVector(normal),
        penetration: Math.max(0, limit - point.y),
        telemetry: Object.freeze({
          distance,
          sampleCount,
          fallbackCount,
          sampleCapReached: requestedSamples > maxSamples,
          hitSample: index,
        }),
      });
    }

    previousT = t;
    previousPoint = point;
    previousGround = terrain;
  }

  return Object.freeze({
    hit: false,
    kind: 'none',
    fraction: 1,
    point: freezeVector(end),
    normal: freezeVector({ x: 0, y: 1, z: 0 }),
    penetration: 0,
    telemetry: Object.freeze({
      distance,
      sampleCount,
      fallbackCount,
      sampleCapReached: requestedSamples > maxSamples,
      hitSample: null,
    }),
  });
}

export { DEFAULTS as SWEPT_CONTACT_DEFAULTS };
