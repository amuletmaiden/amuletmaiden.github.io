const MIN_SAMPLE_DISTANCE = 12;
const MAX_SAMPLE_DISTANCE = 220;
const REQUIRED_TRAVEL = 520;

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
    phase: completed ? 'complete' : 'rise',
    completed,
    regionId: null,
    travel: 0,
    lastPosition: null,
  });
}

export function createFullColumnWeatherRunState() {
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

export function advanceFullColumnWeatherRun(
  state = createFullColumnWeatherRunState(),
  frame = {},
) {
  if (state?.completed === true) return state;
  if (interrupted(frame)) return idleState(false);

  const regionId = cleanId(frame.currentRegionId);
  const deepMistCompleted = frame.deepMistCompleted === true;
  const cloudbreakCompleted = frame.cloudbreakCompleted === true;

  if (state?.active !== true) {
    if (!deepMistCompleted || cloudbreakCompleted) return idleState(false);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'rise',
      completed: false,
      regionId,
      travel: 0,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  if (state.regionId !== regionId) return idleState(false);
  if (!finitePosition(state.lastPosition) || !Number.isFinite(state.travel)) return idleState(false);

  if (deepMistCompleted) return idleState(false);

  const step = distance(state.lastPosition, frame.position);
  const usefulStep = step >= MIN_SAMPLE_DISTANCE && step <= MAX_SAMPLE_DISTANCE ? step : 0;
  const travel = Math.min(REQUIRED_TRAVEL, state.travel + usefulStep);
  const qualified = travel >= REQUIRED_TRAVEL;

  if (cloudbreakCompleted) {
    if (!qualified) return idleState(false);
    return Object.freeze({
      ...state,
      available: true,
      active: false,
      phase: 'complete',
      completed: true,
      travel,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  return Object.freeze({
    ...state,
    phase: qualified ? 'clear' : 'rise',
    travel,
    lastPosition: Object.freeze({ ...frame.position }),
  });
}

export function fullColumnWeatherRunPublicState(state) {
  const phase = state?.phase === 'clear' || state?.phase === 'complete'
    ? state.phase
    : 'rise';
  return Object.freeze({
    available: state?.available === true,
    active: state?.active === true,
    phase,
    completed: state?.completed === true,
  });
}
