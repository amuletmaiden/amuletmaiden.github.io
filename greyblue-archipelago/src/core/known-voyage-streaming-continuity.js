function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function finitePoint(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z);
}

function immutableIds(values) {
  return Object.freeze([...new Set(values.filter(Boolean))].sort());
}

export function createKnownVoyageStreamingContinuity({
  world,
  position,
  activeIslandIds = [],
  discoveredIslandIds = [],
  currentRegionId = null,
  voyageActive = false,
  paused = false,
  recovery = false,
  restorePublishing = false,
  activateRange = 2400,
  retainRange = 3400,
  prewarmRange = 3000,
} = {}) {
  const neutral = Object.freeze({
    active: false,
    retainIslandIds: Object.freeze([]),
    prewarmIslandIds: Object.freeze([]),
  });

  if (!voyageActive || paused || recovery || restorePublishing || !finitePoint(position)) return neutral;
  if (!Array.isArray(world?.islands) || !world.islands.length) return neutral;
  if (![activateRange, retainRange, prewarmRange].every(Number.isFinite)) return neutral;
  if (activateRange <= 0 || retainRange < activateRange || prewarmRange < activateRange) return neutral;

  const known = new Set((Array.isArray(discoveredIslandIds) ? discoveredIslandIds : [])
    .map(cleanId).filter(Boolean));
  if (!known.size) return neutral;

  const active = new Set((Array.isArray(activeIslandIds) ? activeIslandIds : [...activeIslandIds ?? []])
    .map(cleanId).filter(Boolean));
  const regionId = cleanId(currentRegionId);
  const retain = [];
  const prewarm = [];

  for (const island of world.islands) {
    const id = cleanId(island?.id);
    if (!id || !known.has(id) || !Number.isFinite(island?.x) || !Number.isFinite(island?.z)) continue;
    const distance = Math.hypot(island.x - position.x, island.z - position.z);

    if (active.has(id) && distance <= retainRange && (!regionId || cleanId(island.regionId) === regionId)) {
      retain.push(id);
    }
    if (!active.has(id) && distance > activateRange && distance <= prewarmRange) {
      prewarm.push(id);
    }
  }

  const retainIslandIds = immutableIds(retain);
  const prewarmIslandIds = immutableIds(prewarm);
  return Object.freeze({
    active: retainIslandIds.length > 0 || prewarmIslandIds.length > 0,
    retainIslandIds,
    prewarmIslandIds,
  });
}

export function publicKnownVoyageStreamingContinuity(state) {
  return Object.freeze({
    active: state?.active === true,
    retaining: Array.isArray(state?.retainIslandIds) && state.retainIslandIds.length > 0,
    prewarming: Array.isArray(state?.prewarmIslandIds) && state.prewarmIslandIds.length > 0,
  });
}
