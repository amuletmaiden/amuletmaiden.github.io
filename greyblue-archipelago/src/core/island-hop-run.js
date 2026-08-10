const MIN_CRUISE_TRAVEL = 180;
const MIN_SAMPLE_TRAVEL = 18;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function distance(a, b) {
  if (!finitePosition(a) || !finitePosition(b)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function createIslandHopRunState() {
  return Object.freeze({
    armed: false,
    active: false,
    phase: null,
    completed: false,
    lastPosition: null,
    travel: 0,
    cruiseQualified: false,
  });
}

export function startIslandHopRun(state, detail, position) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  if (current.completed || current.armed) return current;
  if (!detail || detail.completed !== true || !finitePosition(position)) return current;
  return Object.freeze({
    ...createIslandHopRunState(),
    armed: true,
    active: true,
    phase: 'depart',
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
  });
}

export function stepIslandHopRun({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  if (current.completed || !current.armed) return current;
  if (!frame || frame.ready !== true || frame.paused === true || frame.recoveryActive === true
    || frame.restorePublishing === true || frame.crossingActive === true || !finitePosition(frame.position)) {
    return createIslandHopRunState();
  }
  const segment = distance(current.lastPosition, frame.position);
  const meaningful = segment >= MIN_SAMPLE_TRAVEL ? segment : 0;
  const travel = current.travel + meaningful;
  const cruiseQualified = current.cruiseQualified || travel >= MIN_CRUISE_TRAVEL;
  return Object.freeze({
    ...current,
    active: true,
    phase: cruiseQualified ? 'cruise' : 'depart',
    lastPosition: Object.freeze({ x: frame.position.x, y: frame.position.y, z: frame.position.z }),
    travel,
    cruiseQualified,
  });
}

export function finishIslandHopRun(state, detail) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  if (current.completed || !current.armed || !current.cruiseQualified) return current;
  if (!detail || detail.completed !== true) return current;
  return Object.freeze({ ...current, active: false, phase: 'arrive', completed: true });
}

export function islandHopRunPublicState(state) {
  const completed = state?.completed === true;
  return Object.freeze({
    available: state?.armed === true || completed,
    active: state?.active === true && !completed,
    phase: ['depart', 'cruise', 'arrive'].includes(state?.phase) ? state.phase : null,
    completed,
  });
}
