const CORE_RADIUS_RATIO = 0.55;
const MIN_EDITABLE_LOCAL_Y = -0.7;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function finiteTriples(values) {
  if (!values || typeof values.length !== 'number' || values.length % 3 !== 0) return null;
  const copy = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) return null;
    copy[index] = value;
  }
  return copy;
}

function localShelfZones(island) {
  const islandX = Number(island?.x);
  const islandZ = Number(island?.z);
  const scale = Number(island?.scale);
  const height = Number(island?.height);
  if (![islandX, islandZ, scale, height].every(Number.isFinite) || scale <= 0 || height <= 0) return [];
  if (!Array.isArray(island?.landingZones)) return [];

  const zones = [];
  for (const candidate of island.landingZones) {
    const x = Number(candidate?.x);
    const y = Number(candidate?.y);
    const z = Number(candidate?.z);
    const radius = Number(candidate?.radius);
    if (![x, y, z, radius].every(Number.isFinite) || radius <= 0) continue;
    zones.push(Object.freeze({
      x: (x - islandX) / scale,
      y: y / height,
      z: (z - islandZ) / scale,
      radius: radius / scale,
    }));
  }
  return zones;
}

export function profileStreamedLandingShelfVertices(profiledPositions, island = {}) {
  const input = finiteTriples(profiledPositions);
  if (!input) return new Float32Array();
  const zones = localShelfZones(island);
  if (!zones.length) return input;

  const output = new Float32Array(input);
  for (let index = 0; index < input.length; index += 3) {
    const x = input[index];
    const y = input[index + 1];
    const z = input[index + 2];
    if (y < MIN_EDITABLE_LOCAL_Y) continue;

    let selected = null;
    let selectedRatio = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
      const distance = Math.hypot(x - zone.x, z - zone.z);
      const ratio = distance / zone.radius;
      if (ratio >= 1 || ratio >= selectedRatio) continue;
      selected = { ...zone, distance };
      selectedRatio = ratio;
    }
    if (!selected) continue;

    const coreRadius = selected.radius * CORE_RADIUS_RATIO;
    const shelfWeight = selected.distance <= coreRadius
      ? 1
      : 1 - smoothstep((selected.distance - coreRadius) / Math.max(1e-6, selected.radius - coreRadius));
    const target = selected.y;
    output[index + 1] = y + (target - y) * shelfWeight;
  }

  return output;
}

export const streamedIslandLandingShelfInternals = Object.freeze({
  CORE_RADIUS_RATIO,
  MIN_EDITABLE_LOCAL_Y,
  smoothstep,
  localShelfZones,
});
