const MIN_STEP_DISTANCE = 18;
const MIN_CLOSING_DISTANCE = 10;
const REQUIRED_TRACE_TRAVEL = 144;

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

function inactiveState(completed = false) {
  return {
    available: false,
    active: false,
    phase: completed ? 'arrival' : null,
    completed,
    targetId: '',
    targetDistance: null,
    lastPosition: null,
    traceTravel: 0,
    qualified: false,
  };
}

export function createMistThreadArrivalState() {
  return inactiveState(false);
}

function startTrace(candidateId, distance, position) {
  return {
    available: true,
    active: true,
    phase: 'trace',
    completed: false,
    targetId: candidateId,
    targetDistance: distance,
    lastPosition: { x: position.x, z: position.z },
    traceTravel: 0,
    qualified: false,
  };
}

export function advanceMistThreadArrival(previous, {
  hint,
  discoveredIslandIds = [],
  position,
  ready = true,
  paused = false,
  airborne = true,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
} = {}) {
  const state = previous?.completed === true ? { ...previous } : (previous ?? createMistThreadArrivalState());
  if (state.completed === true) return state;

  const interrupted = ready !== true || paused === true || airborne !== true || recoveryActive === true || restorePublishing === true || crossingActive === true || !finitePosition(position);
  if (interrupted) return inactiveState(false);

  const discovered = discoveredSet(discoveredIslandIds);
  const activeTargetId = cleanId(state.targetId);

  // Canonical discovery is the only completion authority. Check it before an
  // inactive hint resets the trace because the hint intentionally suppresses
  // itself when ordinary discovery proximity becomes authoritative.
  if (activeTargetId && state.qualified === true && discovered.has(activeTargetId)) {
    return {
      ...inactiveState(true),
      available: true,
      phase: 'arrival',
    };
  }

  const hintId = cleanId(hint?.candidateId);
  const hintDistance = Number(hint?.distance);
  const hintActive = hint?.active === true && hintId && Number.isFinite(hintDistance) && hintDistance > 0;
  if (!hintActive) return inactiveState(false);

  if (!activeTargetId || activeTargetId !== hintId) {
    return startTrace(hintId, hintDistance, position);
  }

  if (!finitePosition(state.lastPosition) || !Number.isFinite(state.targetDistance)) {
    return startTrace(hintId, hintDistance, position);
  }

  const stepDistance = Math.hypot(position.x - state.lastPosition.x, position.z - state.lastPosition.z);
  const closingDistance = state.targetDistance - hintDistance;
  if (!Number.isFinite(stepDistance) || !Number.isFinite(closingDistance) || stepDistance < MIN_STEP_DISTANCE || closingDistance < MIN_CLOSING_DISTANCE) {
    return {
      ...state,
      available: true,
      active: true,
      phase: 'trace',
      targetDistance: hintDistance,
      lastPosition: { x: position.x, z: position.z },
    };
  }

  const traceTravel = state.traceTravel + stepDistance;
  return {
    ...state,
    available: true,
    active: true,
    phase: 'trace',
    targetDistance: hintDistance,
    lastPosition: { x: position.x, z: position.z },
    traceTravel,
    qualified: traceTravel >= REQUIRED_TRACE_TRAVEL,
  };
}

export function mistThreadArrivalPublicState(state) {
  const completed = state?.completed === true;
  const active = !completed && state?.active === true && state?.phase === 'trace';
  const available = completed || active;
  return Object.freeze({
    available,
    active,
    phase: completed ? 'arrival' : active ? 'trace' : null,
    completed,
  });
}
