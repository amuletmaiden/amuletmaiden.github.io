const MIN_RADIUS = 28;
const MAX_RADIUS = 180;
const MIN_STEP_ANGLE = 0.08;
const MAX_STEP_ANGLE = 1.15;
const REQUIRED_ANGLE = Math.PI * 1.65;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function knownLandmark(detail) {
  const landmarkId = detail?.discovered === true && detail?.investigated === true && detail?.eligible === true
    && typeof detail.landmarkId === 'string' ? detail.landmarkId.trim() : '';
  return landmarkId || null;
}

function planarAngle(position, center) {
  if (!finitePosition(position) || !finitePosition(center)) return null;
  const dx = position.x - center.x;
  const dz = position.z - center.z;
  const radius = Math.hypot(dx, dz);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) return null;
  return Math.atan2(dz, dx);
}

function wrappedDelta(next, previous) {
  if (!Number.isFinite(next) || !Number.isFinite(previous)) return null;
  let delta = next - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function createLandmarkOrbitRunState() {
  return Object.freeze({
    active: false,
    completed: false,
    phase: null,
    landmarkId: null,
    center: null,
    lastAngle: null,
    direction: 0,
    accumulatedAngle: 0,
  });
}

export function beginLandmarkOrbitRun(state, detail, position) {
  const current = state && typeof state === 'object' ? state : createLandmarkOrbitRunState();
  const landmarkId = knownLandmark(detail);
  const center = detail?.position;
  const angle = planarAngle(position, center);
  if (current.active || current.completed || !landmarkId || angle === null) return current;
  return Object.freeze({
    ...createLandmarkOrbitRunState(),
    active: true,
    phase: 'circle',
    landmarkId,
    center: Object.freeze({ x: center.x, y: center.y, z: center.z }),
    lastAngle: angle,
  });
}

export function stepLandmarkOrbitRun({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createLandmarkOrbitRunState();
  if (!current.active || current.completed) return current;
  if (!frame || frame.ready !== true || frame.paused === true || frame.recoveryActive === true
    || frame.restorePublishing === true || frame.crossingActive === true || frame.impact === true
    || frame.grounded === true || frame.airborne !== true || !finitePosition(frame.position)) {
    return createLandmarkOrbitRunState();
  }

  const angle = planarAngle(frame.position, current.center);
  if (angle === null) return createLandmarkOrbitRunState();
  const delta = wrappedDelta(angle, current.lastAngle);
  if (!Number.isFinite(delta) || Math.abs(delta) > MAX_STEP_ANGLE) return createLandmarkOrbitRunState();
  if (Math.abs(delta) < MIN_STEP_ANGLE) {
    return Object.freeze({ ...current, lastAngle: angle });
  }

  const sign = Math.sign(delta);
  if (current.direction !== 0 && sign !== current.direction) return createLandmarkOrbitRunState();
  const accumulatedAngle = current.accumulatedAngle + Math.abs(delta);
  const completed = accumulatedAngle >= REQUIRED_ANGLE;
  return Object.freeze({
    ...current,
    active: !completed,
    completed,
    phase: completed ? 'complete' : 'circle',
    lastAngle: angle,
    direction: current.direction || sign,
    accumulatedAngle,
  });
}

export function landmarkOrbitRunPublicState(state) {
  const completed = state?.completed === true;
  return Object.freeze({
    active: state?.active === true && !completed,
    phase: ['circle', 'complete'].includes(state?.phase) ? state.phase : null,
    completed,
  });
}

export function landmarkOrbitRunMessage(state) {
  return state?.completed === true ? 'You circle the landmark and see it whole.' : null;
}
