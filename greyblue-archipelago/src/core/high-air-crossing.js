const PHASES = Object.freeze(['depart', 'cross', 'arrive']);
const MIN_STEP = 32;
const MIN_SPEED = 26;
const REQUIRED_TRAVEL = 620;
const ALTITUDE_MARGIN = 80;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function finitePosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? Object.freeze({ x, y, z })
    : null;
}

function planarDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function discoveredSet(values) {
  return new Set(Array.isArray(values) ? values.map(cleanId).filter(Boolean) : []);
}

function knownAdjacentCandidates(world, currentRegionId, discoveredIslandIds) {
  const regions = Array.isArray(world?.regions) ? world.regions : [];
  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const current = regions.find((region) => cleanId(region?.id) === currentRegionId);
  if (!current) return [];
  const known = discoveredSet(discoveredIslandIds);
  const adjacent = new Set(Array.isArray(current.adjacentRegionIds) ? current.adjacentRegionIds.map(cleanId).filter(Boolean) : []);
  const candidates = [];

  for (const region of regions) {
    const regionId = cleanId(region?.id);
    const anchorIslandId = cleanId(region?.anchorIslandId);
    if (!regionId || !anchorIslandId || !adjacent.has(regionId) || !known.has(anchorIslandId)) continue;
    const connected = routes.some((route) => {
      if (route?.kind !== 'far-ring') return false;
      const from = cleanId(route?.fromRegionId);
      const to = cleanId(route?.toRegionId);
      return (from === currentRegionId && to === regionId) || (to === currentRegionId && from === regionId);
    });
    if (connected) candidates.push(regionId);
  }

  return candidates.sort();
}

export function createHighAirCrossingState() {
  return Object.freeze({
    available: false,
    active: false,
    phase: 'depart',
    completed: false,
    startRegionId: null,
    targetRegionId: null,
    thinningHeight: null,
    lastPosition: null,
    travel: 0,
  });
}

function reset(available = false) {
  return Object.freeze({ ...createHighAirCrossingState(), available });
}

export function advanceHighAirCrossing(previous, {
  ready = false,
  paused = false,
  airborne = false,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
  currentRegionId,
  thinningHeight,
  position,
  planarSpeed,
  cloudbreakState,
  world,
  discoveredIslandIds,
} = {}) {
  if (previous?.completed === true) return previous;
  const regionId = cleanId(currentRegionId);
  const currentPosition = finitePosition(position);
  const ceiling = Number(thinningHeight);
  const speed = Number(planarSpeed);
  const interrupted = !ready || paused || !airborne || recoveryActive || restorePublishing
    || !regionId || !currentPosition || !Number.isFinite(ceiling) || ceiling <= ALTITUDE_MARGIN
    || !Number.isFinite(speed) || speed < 0;
  if (interrupted) return reset(false);

  if (previous?.active !== true) {
    const cloudbreakQualified = cloudbreakState?.active === true && cloudbreakState?.phase === 'cruise';
    if (!cloudbreakQualified || currentPosition.y < ceiling) return reset(false);
    const candidates = knownAdjacentCandidates(world, regionId, discoveredIslandIds);
    if (!candidates.length) return reset(false);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'depart',
      completed: false,
      startRegionId: regionId,
      targetRegionId: candidates[0],
      thinningHeight: ceiling,
      lastPosition: currentPosition,
      travel: 0,
    });
  }

  const startRegionId = cleanId(previous.startRegionId);
  const targetRegionId = cleanId(previous.targetRegionId);
  const priorCeiling = Number(previous.thinningHeight);
  const lastPosition = finitePosition(previous.lastPosition);
  if (!startRegionId || !targetRegionId || !Number.isFinite(priorCeiling) || !lastPosition) return reset(false);

  const qualified = Number(previous.travel) >= REQUIRED_TRAVEL;
  if (regionId !== startRegionId) {
    if (qualified && regionId === targetRegionId) {
      return Object.freeze({
        ...previous,
        active: false,
        phase: 'arrive',
        completed: true,
        lastPosition: currentPosition,
      });
    }
    return reset(false);
  }

  if (Math.abs(priorCeiling - ceiling) > 0.001) return reset(true);
  if (currentPosition.y < ceiling - ALTITUDE_MARGIN) return reset(true);

  if (qualified) {
    return Object.freeze({ ...previous, phase: 'cross', lastPosition: currentPosition });
  }

  if (crossingActive) return Object.freeze({ ...previous, lastPosition: currentPosition });

  const step = planarDistance(currentPosition, lastPosition);
  if (speed < MIN_SPEED || step < MIN_STEP || currentPosition.y < ceiling) {
    return Object.freeze({ ...previous, lastPosition: currentPosition });
  }

  const travel = Math.max(0, Number(previous.travel) || 0) + step;
  return Object.freeze({
    ...previous,
    phase: travel >= REQUIRED_TRAVEL ? 'cross' : 'depart',
    lastPosition: currentPosition,
    travel,
  });
}

export function highAirCrossingPublicState(state) {
  return Object.freeze({
    available: Boolean(state?.available),
    active: Boolean(state?.active),
    phase: PHASES.includes(state?.phase) ? state.phase : 'depart',
    completed: Boolean(state?.completed),
  });
}
