const DEFAULT_INNER_DISTANCE = 360;
const DEFAULT_OUTER_DISTANCE = 1800;
const NEAR_BAND = 760;

function finitePosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.z);
}

function discoveredSet(values) {
  if (values instanceof Set) return new Set(values);
  return new Set(Array.isArray(values) ? values : []);
}

function cleanRegionId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function islandInnerDistance(island) {
  const threshold = Number(island?.discovery?.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return DEFAULT_INNER_DISTANCE;
  return Math.max(DEFAULT_INNER_DISTANCE, threshold * 1.25);
}

function inactiveHint() {
  return Object.freeze({ active: false, hintClass: null, candidateId: '', relative: null, distance: null });
}

export function deriveUndiscoveredIslandMistHint({
  world,
  currentRegionId,
  discoveredIslandIds = [],
  position,
  ready = true,
  paused = false,
  airborne = true,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
} = {}) {
  const regionId = cleanRegionId(currentRegionId);
  if (!world || !Array.isArray(world.islands) || !regionId || !finitePosition(position)) return inactiveHint();
  if (ready !== true || paused === true || airborne !== true || recoveryActive === true || restorePublishing === true || crossingActive === true) {
    return inactiveHint();
  }

  const discovered = discoveredSet(discoveredIslandIds);
  let nearest = null;

  for (const island of world.islands) {
    if (!island?.id || discovered.has(island.id) || island.regionId !== regionId) continue;
    if (!Number.isFinite(island.x) || !Number.isFinite(island.z)) continue;
    const dx = island.x - position.x;
    const dz = island.z - position.z;
    const distance = Math.hypot(dx, dz);
    const innerDistance = islandInnerDistance(island);
    if (!Number.isFinite(distance) || distance <= innerDistance || distance > DEFAULT_OUTER_DISTANCE) continue;
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && String(island.id) < String(nearest.id))) {
      nearest = { id: island.id, dx, dz, distance };
    }
  }

  if (!nearest) return inactiveHint();
  return Object.freeze({
    active: true,
    hintClass: nearest.distance <= NEAR_BAND ? 'near' : 'faint',
    candidateId: String(nearest.id).slice(0, 120),
    relative: Object.freeze({ x: nearest.dx, z: nearest.dz }),
    distance: nearest.distance,
  });
}

export function undiscoveredIslandMistHintPublicState(result) {
  const active = result?.active === true && ['faint', 'near'].includes(result?.hintClass);
  return Object.freeze({
    active,
    hintClass: active ? result.hintClass : null,
  });
}
