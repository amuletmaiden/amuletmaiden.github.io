const PHASES = Object.freeze(['climb', 'cruise', 'return']);
const LOWER_HYSTERESIS = 140;
const CRUISE_FLOOR_MARGIN = 70;
const MIN_STEP = 24;
const MIN_CRUISE_SPEED = 22;
const REQUIRED_HIGH_TRAVEL = 260;

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

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createCloudbreakRunState() {
  return Object.freeze({
    available: false,
    active: false,
    phase: 'climb',
    completed: false,
    regionId: null,
    thinningHeight: null,
    lastPosition: null,
    highTravel: 0,
    crossedAbove: false,
  });
}

function reset(available = false) {
  return Object.freeze({ ...createCloudbreakRunState(), available });
}

export function advanceCloudbreakRun(previous, {
  ready = false,
  paused = false,
  airborne = false,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  regionId,
  thinningHeight,
  position,
  planarSpeed,
} = {}) {
  if (previous?.completed === true) return previous;
  const currentRegionId = cleanId(regionId);
  const currentPosition = finitePosition(position);
  const ceiling = Number(thinningHeight);
  const speed = Number(planarSpeed);
  const interrupted = !ready || paused || !airborne || recoveryActive || crossingActive || restorePublishing
    || !currentRegionId || !currentPosition || !Number.isFinite(ceiling) || ceiling <= LOWER_HYSTERESIS
    || !Number.isFinite(speed) || speed < 0;
  if (interrupted) return reset(false);

  const lowerBand = ceiling - LOWER_HYSTERESIS;
  const cruiseFloor = ceiling - CRUISE_FLOOR_MARGIN;

  if (previous?.active !== true) {
    if (currentPosition.y >= ceiling) return reset(true);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'climb',
      completed: false,
      regionId: currentRegionId,
      thinningHeight: ceiling,
      lastPosition: currentPosition,
      highTravel: 0,
      crossedAbove: false,
    });
  }

  if (cleanId(previous.regionId) !== currentRegionId) return reset(true);
  const priorCeiling = Number(previous.thinningHeight);
  if (!Number.isFinite(priorCeiling) || Math.abs(priorCeiling - ceiling) > 0.001) return reset(true);
  const lastPosition = finitePosition(previous.lastPosition);
  if (!lastPosition) return reset(true);

  if (previous.crossedAbove !== true) {
    if (currentPosition.y < ceiling) return Object.freeze({ ...previous, lastPosition: currentPosition });
    return Object.freeze({
      ...previous,
      phase: 'cruise',
      crossedAbove: true,
      lastPosition: currentPosition,
    });
  }

  const travel = Math.max(0, Number(previous.highTravel) || 0);
  if (travel < REQUIRED_HIGH_TRAVEL) {
    if (currentPosition.y < cruiseFloor) return reset(true);
    const step = distance2(currentPosition, lastPosition);
    if (currentPosition.y < ceiling || speed < MIN_CRUISE_SPEED || step < MIN_STEP) {
      return Object.freeze({ ...previous, phase: 'cruise', lastPosition: currentPosition });
    }
    const highTravel = travel + step;
    return Object.freeze({
      ...previous,
      phase: highTravel >= REQUIRED_HIGH_TRAVEL ? 'return' : 'cruise',
      lastPosition: currentPosition,
      highTravel,
    });
  }

  if (currentPosition.y <= lowerBand) {
    return Object.freeze({
      ...previous,
      active: false,
      phase: 'return',
      completed: true,
      lastPosition: currentPosition,
    });
  }
  return Object.freeze({ ...previous, phase: 'return', lastPosition: currentPosition });
}

export function cloudbreakRunPublicState(state) {
  return Object.freeze({
    available: Boolean(state?.available),
    active: Boolean(state?.active),
    phase: PHASES.includes(state?.phase) ? state.phase : 'climb',
    completed: Boolean(state?.completed),
  });
}
