const PHASES = Object.freeze(['trace', 'approach', 'arrive']);
const MIN_STEP = 18;
const MIN_PROGRESS = 12;
const REQUIRED_TRAVEL = 180;
const ARRIVAL_RADIUS = 230;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function finitePosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? Object.freeze({ x, y, z }) : null;
}

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function hashFocus(regionId, threadClass, landmarkId) {
  let hash = 2166136261;
  const text = `${regionId}:${threadClass}:${landmarkId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function eligibleRegionalMysterySearchFocuses({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  threadClass,
} = {}) {
  const regionId = cleanId(currentRegionId);
  const mysteryClass = cleanId(threadClass);
  if (!regionId || !mysteryClass) return Object.freeze([]);
  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const eligible = islands.map((island) => {
    const islandId = cleanId(island?.id);
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    const islandRegionId = cleanId(island?.regionId);
    const x = Number(island?.x);
    const z = Number(island?.z);
    const height = Number(island?.height);
    if (!islandId || !landmarkId || islandRegionId !== regionId) return null;
    if (!discovered.has(islandId) || !investigated.has(landmarkId)) return null;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(height)) return null;
    return Object.freeze({
      islandId,
      landmarkId,
      x,
      y: height + 48,
      z,
      rank: hashFocus(regionId, mysteryClass, landmarkId),
    });
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.landmarkId.localeCompare(b.landmarkId));
  return Object.freeze(eligible);
}

export function createRegionalMysterySearchFlightState() {
  return Object.freeze({
    available: false,
    active: false,
    phase: 'trace',
    completed: false,
    focusLandmarkId: null,
    focusIslandId: null,
    focusPosition: null,
    lastPosition: null,
    lastDistance: null,
    travel: 0,
  });
}

function reset(available = false) {
  return Object.freeze({ ...createRegionalMysterySearchFlightState(), available });
}

export function advanceRegionalMysterySearchFlight(previous, {
  focuses,
  recognized = false,
  ready = false,
  paused = false,
  airborne = false,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  position,
} = {}) {
  if (previous?.completed === true) return previous;
  const candidates = Array.isArray(focuses) ? focuses : [];
  const currentPosition = finitePosition(position);
  const interrupted = !recognized || !ready || paused || !airborne || recoveryActive || crossingActive || restorePublishing || !currentPosition;
  if (interrupted || candidates.length === 0) return reset(false);

  let focus = null;
  const priorFocus = cleanId(previous?.focusLandmarkId);
  if (previous?.active === true && priorFocus) {
    focus = candidates.find((candidate) => cleanId(candidate?.landmarkId) === priorFocus) ?? null;
    if (!focus) return reset(true);
  } else {
    focus = candidates[0] ?? null;
  }
  const focusPosition = finitePosition(focus);
  if (!focus || !focusPosition) return reset(false);
  const distance = distance2(currentPosition, focusPosition);

  if (previous?.active !== true) {
    return Object.freeze({
      available: true,
      active: true,
      phase: distance <= ARRIVAL_RADIUS * 2 ? 'approach' : 'trace',
      completed: false,
      focusLandmarkId: cleanId(focus.landmarkId),
      focusIslandId: cleanId(focus.islandId),
      focusPosition,
      lastPosition: currentPosition,
      lastDistance: distance,
      travel: 0,
    });
  }

  const lastPosition = finitePosition(previous.lastPosition);
  const lastDistance = Number(previous.lastDistance);
  if (!lastPosition || !Number.isFinite(lastDistance)) return reset(true);
  const step = distance2(currentPosition, lastPosition);
  if (step < MIN_STEP) return previous;
  const closing = lastDistance - distance;
  if (closing < MIN_PROGRESS) return reset(true);

  const travel = Math.max(0, Number(previous.travel) || 0) + step;
  const phase = distance <= ARRIVAL_RADIUS * 2 ? 'approach' : 'trace';
  if (travel >= REQUIRED_TRAVEL && distance <= ARRIVAL_RADIUS) {
    return Object.freeze({
      available: true,
      active: false,
      phase: 'arrive',
      completed: true,
      focusLandmarkId: cleanId(focus.landmarkId),
      focusIslandId: cleanId(focus.islandId),
      focusPosition,
      lastPosition: currentPosition,
      lastDistance: distance,
      travel,
    });
  }
  return Object.freeze({
    available: true,
    active: true,
    phase,
    completed: false,
    focusLandmarkId: cleanId(focus.landmarkId),
    focusIslandId: cleanId(focus.islandId),
    focusPosition,
    lastPosition: currentPosition,
    lastDistance: distance,
    travel,
  });
}

export function regionalMysterySearchFlightPublicState(state) {
  const phase = PHASES.includes(state?.phase) ? state.phase : 'trace';
  return Object.freeze({
    available: Boolean(state?.available),
    active: Boolean(state?.active),
    phase,
    completed: Boolean(state?.completed),
  });
}
