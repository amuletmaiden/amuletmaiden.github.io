const MIN_GROUND_SAMPLES = 2;
const MIN_LAUNCH_SPEED = 14;
const MIN_CLIMB_SPEED = 17;
const MIN_CLIMB_RATE = 1.2;
const CLIMB_PHASE_GAIN = 8;
const COMPLETE_ALTITUDE_GAIN = 22;
const COMPLETE_TRAVEL = 36;
const COMPLETE_AIR_SAMPLES = 3;

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function cleanFrame(frame) {
  const position = frame?.position;
  const speed = Number(frame?.speed);
  const verticalSpeed = Number(frame?.verticalSpeed);
  if (!finitePosition(position) || !Number.isFinite(speed) || speed < 0 || !Number.isFinite(verticalSpeed)) return null;
  return Object.freeze({
    ready: frame?.ready === true,
    paused: frame?.paused === true,
    airborne: frame?.airborne === true,
    recoveryActive: frame?.recoveryActive === true,
    restorePublishing: frame?.restorePublishing === true,
    crossingActive: frame?.crossingActive === true,
    position: Object.freeze({ x: position.x, y: position.y, z: position.z }),
    speed,
    verticalSpeed,
  });
}

export function createTouchAndGoLaunchState() {
  return Object.freeze({
    armed: false,
    active: false,
    phase: null,
    completed: false,
    groundSamples: 0,
    takeoffY: null,
    lastPosition: null,
    travel: 0,
    airSamples: 0,
  });
}

function resetIncomplete() {
  return createTouchAndGoLaunchState();
}

export function armTouchAndGoLaunch(state, detail) {
  const current = state && typeof state === 'object' ? state : createTouchAndGoLaunchState();
  if (current.completed === true || current.armed === true) return current;
  if (!detail || typeof detail !== 'object' || detail.completed !== true) return current;
  return Object.freeze({
    ...createTouchAndGoLaunchState(),
    armed: true,
    active: true,
    phase: 'grounded',
  });
}

export function stepTouchAndGoLaunch({ state, frame }) {
  const current = state && typeof state === 'object' ? state : createTouchAndGoLaunchState();
  if (current.completed === true) return current;
  if (current.armed !== true) return current;

  const nextFrame = cleanFrame(frame);
  if (!nextFrame
    || !nextFrame.ready
    || nextFrame.paused
    || nextFrame.recoveryActive
    || nextFrame.restorePublishing
    || nextFrame.crossingActive) return resetIncomplete();

  if (!nextFrame.airborne) {
    if (current.takeoffY !== null || current.airSamples > 0) return resetIncomplete();
    return Object.freeze({
      ...current,
      active: true,
      phase: 'grounded',
      groundSamples: Math.min(MIN_GROUND_SAMPLES, current.groundSamples + 1),
      lastPosition: nextFrame.position,
    });
  }

  if (current.groundSamples < MIN_GROUND_SAMPLES) return resetIncomplete();
  if (nextFrame.speed < MIN_LAUNCH_SPEED || nextFrame.verticalSpeed <= 0) return resetIncomplete();

  const takeoffY = Number.isFinite(current.takeoffY) ? current.takeoffY : nextFrame.position.y;
  const lastPosition = finitePosition(current.lastPosition) ? current.lastPosition : nextFrame.position;
  const segment = Math.hypot(
    nextFrame.position.x - lastPosition.x,
    nextFrame.position.y - lastPosition.y,
    nextFrame.position.z - lastPosition.z,
  );
  const travel = current.travel + (Number.isFinite(segment) ? segment : 0);
  const airSamples = current.airSamples + 1;
  const altitudeGain = nextFrame.position.y - takeoffY;
  const climbing = nextFrame.speed >= MIN_CLIMB_SPEED && nextFrame.verticalSpeed >= MIN_CLIMB_RATE;
  const phase = climbing && altitudeGain >= CLIMB_PHASE_GAIN ? 'climb' : 'launch';
  const completed = climbing
    && altitudeGain >= COMPLETE_ALTITUDE_GAIN
    && travel >= COMPLETE_TRAVEL
    && airSamples >= COMPLETE_AIR_SAMPLES;

  return Object.freeze({
    ...current,
    active: !completed,
    phase: completed ? 'climb' : phase,
    completed,
    takeoffY,
    lastPosition: nextFrame.position,
    travel,
    airSamples,
  });
}

export function touchAndGoLaunchPublicState(state) {
  const completed = state?.completed === true;
  const active = state?.active === true && !completed;
  const phase = ['grounded', 'launch', 'climb'].includes(state?.phase) ? state.phase : null;
  return Object.freeze({
    available: state?.armed === true || completed,
    active,
    phase,
    completed,
  });
}
