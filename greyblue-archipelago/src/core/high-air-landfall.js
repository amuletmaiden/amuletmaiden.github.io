const PHASES = Object.freeze(['descent', 'approach', 'settle']);
const ALTITUDE_MARGIN = 90;
const MIN_STEP = 28;
const REQUIRED_APPROACH_TRAVEL = 260;

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

function discoveredSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  return new Set(Array.isArray(values) ? values.map(cleanId).filter(Boolean) : []);
}

function validAnchor(island, regionId, discoveredIslandIds) {
  const islandId = cleanId(island?.id);
  return Boolean(
    islandId
    && cleanId(island?.regionId) === regionId
    && discoveredSet(discoveredIslandIds).has(islandId)
    && Number.isFinite(Number(island?.x))
    && Number.isFinite(Number(island?.z)),
  );
}

function landingContains(island, position) {
  const point = finitePosition(position);
  if (!point) return false;
  const zones = Array.isArray(island?.landingZones) ? island.landingZones : [];
  return zones.some((zone) => {
    const x = Number(zone?.x);
    const y = Number(zone?.y);
    const z = Number(zone?.z);
    const radius = Number(zone?.radius);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) return false;
    const horizontal = Math.hypot(point.x - x, point.z - z);
    const vertical = Number.isFinite(y) ? Math.abs(point.y - y) : 0;
    return horizontal <= radius && vertical <= Math.max(30, radius * 0.45);
  });
}

function reset(available = false) {
  return Object.freeze({
    available,
    active: false,
    phase: 'descent',
    completed: false,
    regionId: null,
    anchorIslandId: null,
    thinningHeight: null,
    descended: false,
    approachTravel: 0,
    lastPosition: null,
  });
}

export function createHighAirLandfallState() {
  return reset(false);
}

export function advanceHighAirLandfall(previous, {
  highAirCrossingCompleted = false,
  ready = false,
  paused = false,
  airborne = false,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
  currentRegionId,
  thinningHeight,
  anchorIsland,
  discoveredIslandIds,
  position,
  precisionTouchdownCompleted = false,
  landedPosition,
} = {}) {
  if (previous?.completed === true) return previous;

  const regionId = cleanId(currentRegionId);
  const anchorId = cleanId(anchorIsland?.id);
  const ceiling = Number(thinningHeight);
  const currentPosition = finitePosition(position);
  const baseValid = ready === true
    && paused !== true
    && recoveryActive !== true
    && restorePublishing !== true
    && crossingActive !== true
    && regionId
    && anchorId
    && Number.isFinite(ceiling)
    && ceiling > ALTITUDE_MARGIN
    && currentPosition
    && validAnchor(anchorIsland, regionId, discoveredIslandIds);

  if (!baseValid) return reset(false);

  if (previous?.active !== true) {
    if (highAirCrossingCompleted !== true || airborne !== true || currentPosition.y < ceiling) return reset(false);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'descent',
      completed: false,
      regionId,
      anchorIslandId: anchorId,
      thinningHeight: ceiling,
      descended: false,
      approachTravel: 0,
      lastPosition: currentPosition,
    });
  }

  const priorRegionId = cleanId(previous.regionId);
  const priorAnchorId = cleanId(previous.anchorIslandId);
  const priorCeiling = Number(previous.thinningHeight);
  const lastPosition = finitePosition(previous.lastPosition);
  if (!priorRegionId || !priorAnchorId || !Number.isFinite(priorCeiling) || !lastPosition) return reset(false);
  if (regionId !== priorRegionId || anchorId !== priorAnchorId || Math.abs(ceiling - priorCeiling) > 0.001) return reset(false);

  if (precisionTouchdownCompleted === true) {
    const qualified = previous.descended === true && Number(previous.approachTravel) >= REQUIRED_APPROACH_TRAVEL;
    if (qualified && airborne === false && landingContains(anchorIsland, landedPosition ?? currentPosition)) {
      return Object.freeze({
        ...previous,
        available: true,
        active: false,
        phase: 'settle',
        completed: true,
        lastPosition: currentPosition,
      });
    }
    return reset(false);
  }

  if (airborne !== true) return reset(false);

  const descended = previous.descended === true || currentPosition.y <= priorCeiling - ALTITUDE_MARGIN;
  const step = Math.hypot(currentPosition.x - lastPosition.x, currentPosition.z - lastPosition.z);
  const meaningfulStep = Number.isFinite(step) && step >= MIN_STEP ? step : 0;
  const approachTravel = descended
    ? Math.max(0, Number(previous.approachTravel) || 0) + meaningfulStep
    : Math.max(0, Number(previous.approachTravel) || 0);

  return Object.freeze({
    ...previous,
    available: true,
    active: true,
    phase: descended ? 'approach' : 'descent',
    descended,
    approachTravel,
    lastPosition: currentPosition,
  });
}

export function highAirLandfallPublicState(state) {
  return Object.freeze({
    available: Boolean(state?.available),
    active: Boolean(state?.active),
    phase: PHASES.includes(state?.phase) ? state.phase : 'descent',
    completed: Boolean(state?.completed),
  });
}
