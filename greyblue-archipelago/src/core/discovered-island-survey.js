const SECTOR_COUNT = 12;
const REQUIRED_SECTORS = 9;
const MIN_STEP = 24;
const REQUIRED_PATH = 720;

function finitePosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.z);
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function discoveredSet(values) {
  if (values instanceof Set) return new Set(values);
  return new Set(Array.isArray(values) ? values : []);
}

function popcount(mask) {
  let value = mask >>> 0;
  let count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function sectorFor(dx, dz) {
  const angle = Math.atan2(dz, dx);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return Math.min(SECTOR_COUNT - 1, Math.floor((normalized / (Math.PI * 2)) * SECTOR_COUNT));
}

function envelopeFor(island) {
  const authoredRadius = Number(island?.radius);
  const radius = Number.isFinite(authoredRadius) && authoredRadius > 0 ? authoredRadius : 180;
  return {
    inner: Math.max(220, radius * 1.25),
    outer: Math.max(980, radius * 4.2),
  };
}

function idle(completed = false) {
  return {
    available: false,
    active: false,
    phase: completed ? 'complete' : null,
    completed,
    islandId: '',
    sectorMask: 0,
    pathTravel: 0,
    lastPosition: null,
  };
}

export function createDiscoveredIslandSurveyState() {
  return idle(false);
}

export function advanceDiscoveredIslandSurvey(previous, {
  island,
  discoveredIslandIds = [],
  currentRegionId,
  position,
  ready = true,
  paused = false,
  airborne = true,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
} = {}) {
  const prior = previous ?? createDiscoveredIslandSurveyState();
  if (prior.completed === true) return prior;

  if (ready !== true || paused === true || airborne !== true || recoveryActive === true || restorePublishing === true || crossingActive === true || !finitePosition(position)) {
    return idle(false);
  }

  const islandId = cleanId(island?.id);
  const regionId = cleanId(currentRegionId);
  if (!islandId || !regionId || island?.regionId !== regionId || !Number.isFinite(island?.x) || !Number.isFinite(island?.z)) return idle(false);
  if (!discoveredSet(discoveredIslandIds).has(islandId)) return idle(false);

  const dx = position.x - island.x;
  const dz = position.z - island.z;
  const radialDistance = Math.hypot(dx, dz);
  const envelope = envelopeFor(island);
  if (!Number.isFinite(radialDistance) || radialDistance < envelope.inner || radialDistance > envelope.outer) return idle(false);

  const sector = sectorFor(dx, dz);
  const bit = 1 << sector;
  if (prior.active !== true || cleanId(prior.islandId) !== islandId || !finitePosition(prior.lastPosition)) {
    return {
      available: true,
      active: true,
      phase: 'acquire',
      completed: false,
      islandId,
      sectorMask: bit,
      pathTravel: 0,
      lastPosition: { x: position.x, z: position.z },
    };
  }

  const step = Math.hypot(position.x - prior.lastPosition.x, position.z - prior.lastPosition.z);
  if (!Number.isFinite(step) || step < MIN_STEP) {
    return {
      ...prior,
      available: true,
      active: true,
      lastPosition: { x: position.x, z: position.z },
    };
  }

  const sectorMask = prior.sectorMask | bit;
  const pathTravel = prior.pathTravel + step;
  const sectors = popcount(sectorMask);
  const completed = sectors >= REQUIRED_SECTORS && pathTravel >= REQUIRED_PATH;
  return {
    available: true,
    active: !completed,
    phase: completed ? 'complete' : sectors >= 4 ? 'circle' : 'acquire',
    completed,
    islandId,
    sectorMask,
    pathTravel,
    lastPosition: { x: position.x, z: position.z },
  };
}

export function discoveredIslandSurveyPublicState(state) {
  const completed = state?.completed === true;
  const active = !completed && state?.active === true && ['acquire', 'circle'].includes(state?.phase);
  return Object.freeze({
    available: completed || active,
    active,
    phase: completed ? 'complete' : active ? state.phase : null,
    completed,
  });
}
