const MIN_THINNING_HEIGHT = 240;
const MIN_SPEED = 26;
const MIN_SAMPLE_DISTANCE = 10;
const MAX_SAMPLE_DISTANCE = 220;
const REQUIRED_TRAVEL = 620;

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
    phase: completed ? 'climb' : 'descend',
    completed,
    regionId: null,
    entryHeight: null,
    exitHeight: null,
    travel: 0,
    lastPosition: null,
  });
}

export function createDeepMistRunState() {
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
    || !cleanId(frame?.currentRegionId)
    || !Number.isFinite(frame?.thinningHeight)
    || frame.thinningHeight < MIN_THINNING_HEIGHT;
}

export function advanceDeepMistRun(state = createDeepMistRunState(), frame = {}) {
  if (state?.completed === true) return state;
  if (interrupted(frame)) return idleState(false);

  const regionId = cleanId(frame.currentRegionId);
  const thinningHeight = Number(frame.thinningHeight);
  const entryHeight = thinningHeight * 0.36;
  const exitHeight = thinningHeight * 0.48;
  const y = Number(frame.position.y);

  if (state?.active !== true) {
    const validStart = y >= exitHeight && y < thinningHeight * 0.9;
    if (!validStart) return idleState(false);
    return Object.freeze({
      available: true,
      active: true,
      phase: 'descend',
      completed: false,
      regionId,
      entryHeight,
      exitHeight,
      travel: 0,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  if (state.regionId !== regionId) return idleState(false);
  if (!Number.isFinite(state.entryHeight) || !Number.isFinite(state.exitHeight)) return idleState(false);

  if (state.phase === 'descend') {
    if (y <= state.entryHeight) {
      return Object.freeze({
        ...state,
        phase: 'thread',
        lastPosition: Object.freeze({ ...frame.position }),
      });
    }
    return Object.freeze({ ...state, lastPosition: Object.freeze({ ...frame.position }) });
  }

  if (state.phase === 'thread') {
    if (y >= state.exitHeight) return idleState(false);
    const step = finitePosition(state.lastPosition) ? distance(state.lastPosition, frame.position) : 0;
    const usefulStep = step >= MIN_SAMPLE_DISTANCE
      && step <= MAX_SAMPLE_DISTANCE
      && Number.isFinite(frame.speed)
      && frame.speed >= MIN_SPEED
      ? step
      : 0;
    const travel = Math.min(REQUIRED_TRAVEL, state.travel + usefulStep);
    return Object.freeze({
      ...state,
      phase: travel >= REQUIRED_TRAVEL ? 'climb' : 'thread',
      travel,
      lastPosition: Object.freeze({ ...frame.position }),
    });
  }

  if (state.phase === 'climb') {
    if (y >= state.exitHeight) {
      return Object.freeze({
        ...state,
        available: true,
        active: false,
        phase: 'climb',
        completed: true,
        lastPosition: Object.freeze({ ...frame.position }),
      });
    }
    return Object.freeze({ ...state, lastPosition: Object.freeze({ ...frame.position }) });
  }

  return idleState(false);
}

export function deepMistRunPublicState(state) {
  return Object.freeze({
    available: state?.available === true,
    active: state?.active === true,
    phase: state?.phase === 'thread' || state?.phase === 'climb' ? state.phase : 'descend',
    completed: state?.completed === true,
  });
}
