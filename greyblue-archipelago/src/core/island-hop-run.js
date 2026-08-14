const MIN_CRUISE_TRAVEL = 180;
const MIN_SAMPLE_TRAVEL = 18;
const MAX_SAMPLE_TRAVEL = 260;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function distance(a, b) {
  if (!finitePosition(a) || !finitePosition(b)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function truthfulIsland(detail) {
  const islandId = detail?.completed === true && typeof detail.islandId === 'string'
    ? detail.islandId.trim()
    : '';
  return islandId || null;
}

export function createIslandHopRunState() {
  return Object.freeze({
    armed: false,
    active: false,
    phase: null,
    completed: false,
    visitedIslandIds: Object.freeze([]),
    lastPosition: null,
    travel: 0,
    cruiseQualified: false,
  });
}

export function startIslandHopRun(state, detail, position) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  const islandId = truthfulIsland(detail);
  if (current.completed || current.armed || !islandId || !finitePosition(position)) return current;
  return Object.freeze({
    ...createIslandHopRunState(),
    armed: true,
    active: true,
    phase: 'depart',
    visitedIslandIds: Object.freeze([islandId]),
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
  });
}

export function stepIslandHopRun({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  if (current.completed || !current.armed) return current;
  if (!frame || frame.ready !== true || frame.paused === true || frame.recoveryActive === true
    || frame.restorePublishing === true || frame.crossingActive === true || frame.impact === true
    || frame.grounded === true || frame.airborne !== true || !finitePosition(frame.position)) {
    return createIslandHopRunState();
  }
  const segment = distance(current.lastPosition, frame.position);
  if (segment > MAX_SAMPLE_TRAVEL) return createIslandHopRunState();
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

export function finishIslandHopRun(state, detail, position = state?.lastPosition) {
  const current = state && typeof state === 'object' ? state : createIslandHopRunState();
  const islandId = truthfulIsland(detail);
  if (current.completed || !current.armed || !current.cruiseQualified || !islandId || !finitePosition(position)) return current;
  if (current.visitedIslandIds.includes(islandId)) return current;

  const visitedIslandIds = Object.freeze([...current.visitedIslandIds, islandId]);
  if (visitedIslandIds.length >= 3) {
    return Object.freeze({
      ...current,
      active: false,
      phase: 'arrive',
      completed: true,
      visitedIslandIds,
      lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
      travel: 0,
      cruiseQualified: false,
    });
  }

  return Object.freeze({
    ...current,
    active: true,
    phase: 'depart',
    visitedIslandIds,
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
    travel: 0,
    cruiseQualified: false,
  });
}

export function islandHopRunPublicState(state) {
  const completed = state?.completed === true;
  return Object.freeze({
    active: state?.active === true && !completed,
    phase: ['depart', 'cruise', 'arrive'].includes(state?.phase) ? state.phase : null,
    completed,
  });
}
