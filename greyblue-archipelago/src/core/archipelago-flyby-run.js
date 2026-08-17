const MIN_TRAVEL_BETWEEN_FLYBYS = 140;
const MIN_SAMPLE_TRAVEL = 16;
const MAX_SAMPLE_TRAVEL = 260;
const REQUIRED_FLYBYS = 3;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function distance(a, b) {
  if (!finitePosition(a) || !finitePosition(b)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function truthfulFlyby(detail) {
  const islandId = detail?.eligible === true && detail?.discovered === true && typeof detail.islandId === 'string'
    ? detail.islandId.trim()
    : '';
  return islandId || null;
}

export function createArchipelagoFlybyRunState() {
  return Object.freeze({
    active: false,
    completed: false,
    phase: null,
    visitedIslandIds: Object.freeze([]),
    lastPosition: null,
    travelSinceFlyby: 0,
  });
}

export function beginArchipelagoFlybyRun(state, detail, position) {
  const current = state && typeof state === 'object' ? state : createArchipelagoFlybyRunState();
  const islandId = truthfulFlyby(detail);
  if (current.completed || current.active || !islandId || !finitePosition(position)) return current;
  return Object.freeze({
    ...createArchipelagoFlybyRunState(),
    active: true,
    phase: 'range',
    visitedIslandIds: Object.freeze([islandId]),
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
  });
}

export function stepArchipelagoFlybyRun({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createArchipelagoFlybyRunState();
  if (current.completed || !current.active) return current;
  if (!frame || frame.ready !== true || frame.paused === true || frame.recoveryActive === true
    || frame.restorePublishing === true || frame.crossingActive === true || frame.impact === true
    || frame.grounded === true || frame.airborne !== true || !finitePosition(frame.position)) {
    return createArchipelagoFlybyRunState();
  }

  const segment = distance(current.lastPosition, frame.position);
  if (segment > MAX_SAMPLE_TRAVEL) return createArchipelagoFlybyRunState();
  const travelSinceFlyby = current.travelSinceFlyby + (segment >= MIN_SAMPLE_TRAVEL ? segment : 0);
  return Object.freeze({
    ...current,
    phase: travelSinceFlyby >= MIN_TRAVEL_BETWEEN_FLYBYS ? 'seek' : 'range',
    lastPosition: Object.freeze({ x: frame.position.x, y: frame.position.y, z: frame.position.z }),
    travelSinceFlyby,
  });
}

export function registerArchipelagoFlyby(state, detail, position = state?.lastPosition) {
  const current = state && typeof state === 'object' ? state : createArchipelagoFlybyRunState();
  const islandId = truthfulFlyby(detail);
  if (current.completed || !current.active || current.travelSinceFlyby < MIN_TRAVEL_BETWEEN_FLYBYS
    || !islandId || !finitePosition(position) || current.visitedIslandIds.includes(islandId)) return current;

  const visitedIslandIds = Object.freeze([...current.visitedIslandIds, islandId]);
  const completed = visitedIslandIds.length >= REQUIRED_FLYBYS;
  return Object.freeze({
    ...current,
    active: !completed,
    completed,
    phase: completed ? 'complete' : 'range',
    visitedIslandIds,
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
    travelSinceFlyby: 0,
  });
}

export function archipelagoFlybyRunPublicState(state) {
  const completed = state?.completed === true;
  return Object.freeze({
    active: state?.active === true && !completed,
    phase: ['range', 'seek', 'complete'].includes(state?.phase) ? state.phase : null,
    completed,
  });
}
