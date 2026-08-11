const MIN_SAMPLE_DISTANCE = 12;
const MAX_SAMPLE_DISTANCE = 220;
const REQUIRED_TRAVEL = 360;
const REQUIRED_CLIMB = 90;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function finitePosition(position) {
  return Boolean(position)
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function idleState(completed = false) {
  return Object.freeze({
    available: false,
    active: false,
    phase: completed ? 'clear' : 'depart',
    completed,
    regionId: null,
    travel: 0,
    baselineY: null,
    maxClimb: 0,
    lastPosition: null,
  });
}

export function createRidgeToCloudAscentState() {
  return idleState(false);
}

function interrupted(frame) {
  return frame?.ready !== true
    || frame?.paused === true
    || frame?.airborne !== true
    || frame?.recoveryActive === true
    || frame?.crossingActive === true
    || frame?.restorePublishing === true
    || !finitePosition(frame?.position)
    || !cleanId(frame?.currentRegionId);
}

export function advanceRidgeToCloudAscent(
  state = createRidgeToCloudAscentState(),
  frame = {},
) {
  if (state?.completed === true) return state;
  if (interrupted(frame)) return idleState(false);

  const regionId = cleanId(frame.currentRegionId);
  const ridgeCompleted = frame.ridgeCompleted === true;
  const cloudbreakCompleted = frame.cloudbreakCompleted === true;

  if (state?.active !== true) {
    if (!ridgeCompleted || cloudbreakCompleted) return idleState(false);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'depart',
      completed: false,
      regionId,
      travel: 0,
      baselineY: frame.position.y,
      maxClimb: 0,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  if (state.regionId !== regionId) return idleState(false);
  if (!finitePosition(state.lastPosition) || !Number.isFinite(state.travel) || !Number.isFinite(state.baselineY)) return idleState(false);
  if (ridgeCompleted) return idleState(false);

  const step = distance(state.lastPosition, frame.position);
  const usefulStep = step >= MIN_SAMPLE_DISTANCE && step <= MAX_SAMPLE_DISTANCE ? step : 0;
  const travel = Math.min(REQUIRED_TRAVEL, state.travel + usefulStep);
  const maxClimb = Math.max(state.maxClimb, frame.position.y - state.baselineY);
  const qualified = travel >= REQUIRED_TRAVEL && maxClimb >= REQUIRED_CLIMB;

  if (cloudbreakCompleted) {
    if (!qualified) return idleState(false);
    return Object.freeze({
      ...state,
      available: true,
      active: false,
      phase: 'clear',
      completed: true,
      travel,
      maxClimb,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  return Object.freeze({
    ...state,
    phase: maxClimb >= REQUIRED_CLIMB ? 'climb' : 'depart',
    travel,
    maxClimb,
    lastPosition: Object.freeze({ ...frame.position }),
  });
}

export function ridgeToCloudAscentPublicState(state) {
  const phase = state?.phase === 'climb' || state?.phase === 'clear' ? state.phase : 'depart';
  return Object.freeze({
    available: state?.available === true,
    active: state?.active === true,
    phase,
    completed: state?.completed === true,
  });
}
