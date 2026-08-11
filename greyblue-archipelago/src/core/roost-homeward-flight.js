const PHASES = new Set(['depart', 'homeward', 'settle']);
const MIN_SPACING = 18;
const MAX_STEP = 260;
const MIN_CLOSING_TRAVEL = 260;
const DEPART_MARGIN = 120;

function finitePoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
    ? Object.freeze({ x: value.x, y: value.y, z: value.z })
    : null;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function validTarget(target) {
  const islandId = cleanId(target?.islandId);
  const zoneId = cleanId(target?.zoneId);
  const center = finitePoint(target?.center);
  const radius = Number(target?.radius);
  if (!islandId || !zoneId || !center || !Number.isFinite(radius) || radius <= 0) return null;
  return Object.freeze({ islandId, zoneId, center, radius });
}

function emptyState() {
  return Object.freeze({
    available: false,
    active: false,
    phase: null,
    completed: false,
    target: null,
    lastPosition: null,
    closingTravel: 0,
  });
}

export function createRoostHomewardFlightState() {
  return emptyState();
}

function validFrame(frame) {
  return frame?.ready === true
    && frame?.paused !== true
    && frame?.airborne === true
    && frame?.recoveryActive !== true
    && frame?.crossingActive !== true
    && frame?.restorePublishing !== true
    && cleanId(frame?.regionId)
    && finitePoint(frame?.position);
}

function sameTarget(a, b) {
  return a && b && a.islandId === b.islandId && a.zoneId === b.zoneId;
}

export function stepRoostHomewardFlight({ state = createRoostHomewardFlightState(), frame = {}, target = null } = {}) {
  const resolvedTarget = validTarget(target);
  if (!resolvedTarget || !validFrame(frame)) return emptyState();

  const position = finitePoint(frame.position);
  const regionId = cleanId(frame.regionId);
  const targetRegionId = cleanId(target?.regionId ?? frame.regionId);
  if (!targetRegionId || targetRegionId !== regionId) return emptyState();

  const currentDistance = distance(position, resolvedTarget.center);
  const departureDistance = resolvedTarget.radius + DEPART_MARGIN;
  const priorTarget = validTarget(state?.target);
  const continuing = state?.active === true && sameTarget(priorTarget, resolvedTarget) && PHASES.has(state?.phase);

  if (!continuing) {
    if (currentDistance <= departureDistance) {
      return Object.freeze({ ...emptyState(), available: true, phase: 'depart', target: resolvedTarget, lastPosition: position });
    }
    return Object.freeze({
      available: true,
      active: true,
      phase: 'homeward',
      completed: false,
      target: resolvedTarget,
      lastPosition: position,
      closingTravel: 0,
    });
  }

  const lastPosition = finitePoint(state.lastPosition);
  if (!lastPosition) return emptyState();
  const step = distance(lastPosition, position);
  if (step > MAX_STEP) return emptyState();
  if (step < MIN_SPACING) {
    return Object.freeze({ ...state, target: resolvedTarget, lastPosition: position, completed: false });
  }

  const priorDistance = distance(lastPosition, resolvedTarget.center);
  const closingTravel = Math.max(0, Number(state.closingTravel) || 0) + Math.max(0, priorDistance - currentDistance);
  const phase = closingTravel >= MIN_CLOSING_TRAVEL && currentDistance <= departureDistance ? 'settle' : 'homeward';

  return Object.freeze({
    available: true,
    active: true,
    phase,
    completed: false,
    target: resolvedTarget,
    lastPosition: position,
    closingTravel,
  });
}

export function completeRoostHomewardFlight({ state = createRoostHomewardFlightState(), restEvent = null } = {}) {
  if (state?.active !== true || state?.phase !== 'settle' || restEvent?.beganRest !== true) return state;
  const target = validTarget(state.target);
  if (!target) return emptyState();
  const islandId = cleanId(restEvent?.islandId ?? target.islandId);
  const zoneId = cleanId(restEvent?.zoneId ?? target.zoneId);
  if (islandId !== target.islandId || zoneId !== target.zoneId) return emptyState();
  return Object.freeze({ ...state, active: false, phase: 'settle', completed: true });
}

export function roostHomewardFlightPublicState(state = null) {
  const phase = PHASES.has(state?.phase) ? state.phase : null;
  return Object.freeze({
    available: state?.available === true,
    active: state?.active === true,
    phase,
    completed: state?.completed === true,
  });
}
