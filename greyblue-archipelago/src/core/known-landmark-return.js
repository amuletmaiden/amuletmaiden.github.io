const MIN_DEPARTURE_TRAVEL = 120;
const MIN_SAMPLE_TRAVEL = 14;
const MAX_SAMPLE_TRAVEL = 260;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function distance(a, b) {
  if (!finitePosition(a) || !finitePosition(b)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function knownLandmark(detail) {
  const landmarkId = detail?.discovered === true && detail?.investigated === true && detail?.eligible === true
    && typeof detail.landmarkId === 'string' ? detail.landmarkId.trim() : '';
  return landmarkId || null;
}

export function createKnownLandmarkReturnState() {
  return Object.freeze({
    active: false,
    completed: false,
    phase: null,
    landmarkId: null,
    lastPosition: null,
    departureTravel: 0,
  });
}

export function beginKnownLandmarkReturn(state, detail, position) {
  const current = state && typeof state === 'object' ? state : createKnownLandmarkReturnState();
  const landmarkId = knownLandmark(detail);
  if (current.active || current.completed || !landmarkId || !finitePosition(position)) return current;
  return Object.freeze({
    ...createKnownLandmarkReturnState(),
    active: true,
    phase: 'depart',
    landmarkId,
    lastPosition: Object.freeze({ x: position.x, y: position.y, z: position.z }),
  });
}

export function stepKnownLandmarkReturn({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createKnownLandmarkReturnState();
  if (!current.active || current.completed) return current;
  if (!frame || frame.ready !== true || frame.paused === true || frame.recoveryActive === true
    || frame.restorePublishing === true || frame.crossingActive === true || frame.impact === true
    || frame.grounded === true || frame.airborne !== true || !finitePosition(frame.position)) {
    return createKnownLandmarkReturnState();
  }

  const segment = distance(current.lastPosition, frame.position);
  if (segment > MAX_SAMPLE_TRAVEL) return createKnownLandmarkReturnState();
  const departureTravel = current.departureTravel + (segment >= MIN_SAMPLE_TRAVEL ? segment : 0);
  return Object.freeze({
    ...current,
    phase: departureTravel >= MIN_DEPARTURE_TRAVEL ? 'return' : 'depart',
    lastPosition: Object.freeze({ x: frame.position.x, y: frame.position.y, z: frame.position.z }),
    departureTravel,
  });
}

export function registerKnownLandmarkReturn(state, detail) {
  const current = state && typeof state === 'object' ? state : createKnownLandmarkReturnState();
  const landmarkId = knownLandmark(detail);
  if (!current.active || current.completed || current.departureTravel < MIN_DEPARTURE_TRAVEL
    || !landmarkId || landmarkId !== current.landmarkId) return current;
  return Object.freeze({
    ...current,
    active: false,
    completed: true,
    phase: 'complete',
  });
}

export function knownLandmarkReturnPublicState(state) {
  const completed = state?.completed === true;
  return Object.freeze({
    active: state?.active === true && !completed,
    phase: ['depart', 'return', 'complete'].includes(state?.phase) ? state.phase : null,
    completed,
  });
}

export function knownLandmarkReturnMessage(state) {
  return state?.completed === true ? 'You find the landmark again from the air.' : null;
}
