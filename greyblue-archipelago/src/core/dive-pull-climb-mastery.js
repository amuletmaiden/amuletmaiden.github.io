const PUBLIC_PHASES = Object.freeze(['dive', 'pull', 'climb']);

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function frozenState(overrides = {}) {
  return Object.freeze({
    phase: 'idle',
    diveStartAltitude: null,
    lowAltitude: null,
    diveFrames: 0,
    diveEstablished: false,
    climbBaseAltitude: null,
    climbPeakAltitude: null,
    completed: false,
    ...overrides,
  });
}

export function createDivePullClimbState() {
  return frozenState();
}

function reset(completed = false) {
  return frozenState({ completed });
}

function eligibleFrame(frame) {
  const speed = finite(frame?.speed);
  const altitude = finite(frame?.altitude);
  const verticalSpeed = finite(frame?.verticalSpeed);
  const eligible = frame?.ready === true
    && frame?.paused !== true
    && frame?.airborne === true
    && frame?.recoveryActive !== true
    && frame?.restorePublishing !== true
    && speed != null
    && altitude != null
    && verticalSpeed != null
    && speed >= 20;
  return eligible ? { speed, altitude, verticalSpeed } : null;
}

export function stepDivePullClimb({ state = createDivePullClimbState(), frame = {} } = {}) {
  if (state?.completed === true) return reset(true);
  const sample = eligibleFrame(frame);
  if (!sample) return reset(false);

  const airClass = typeof frame?.airClass === 'string' ? frame.airClass : null;
  const priorPhase = PUBLIC_PHASES.includes(state?.phase) ? state.phase : 'idle';

  if (priorPhase === 'idle') {
    if (airClass !== 'dive' || sample.verticalSpeed > -10 || sample.speed < 28) return reset(false);
    return frozenState({
      phase: 'dive',
      diveStartAltitude: sample.altitude,
      lowAltitude: sample.altitude,
      diveFrames: 1,
    });
  }

  if (priorPhase === 'dive') {
    const startAltitude = finite(state?.diveStartAltitude);
    const priorLow = finite(state?.lowAltitude);
    if (startAltitude == null || priorLow == null) return reset(false);
    const lowAltitude = Math.min(priorLow, sample.altitude);
    const diveFrames = Math.max(0, Number.isInteger(state?.diveFrames) ? state.diveFrames : 0) + 1;
    const altitudeLoss = Math.max(0, startAltitude - lowAltitude);
    const established = state?.diveEstablished === true || (diveFrames >= 2 && altitudeLoss >= 24);

    if (airClass === 'dive' && sample.verticalSpeed <= -7 && sample.speed >= 26) {
      return frozenState({
        phase: 'dive',
        diveStartAltitude: startAltitude,
        lowAltitude,
        diveFrames,
        diveEstablished: established,
      });
    }

    if (established && sample.verticalSpeed >= -3 && sample.speed >= 26) {
      return frozenState({
        phase: 'pull',
        diveStartAltitude: startAltitude,
        lowAltitude,
        diveFrames,
        diveEstablished: true,
      });
    }
    return reset(false);
  }

  if (priorPhase === 'pull') {
    const startAltitude = finite(state?.diveStartAltitude);
    const lowAltitude = finite(state?.lowAltitude);
    if (startAltitude == null || lowAltitude == null || state?.diveEstablished !== true) return reset(false);
    if (sample.speed < 24 || airClass === 'dive' || sample.verticalSpeed < -5) return reset(false);
    if (airClass === 'climb' && sample.verticalSpeed >= 8) {
      return frozenState({
        phase: 'climb',
        diveStartAltitude: startAltitude,
        lowAltitude,
        diveFrames: Math.max(2, Number.isInteger(state?.diveFrames) ? state.diveFrames : 2),
        diveEstablished: true,
        climbBaseAltitude: sample.altitude,
        climbPeakAltitude: sample.altitude,
      });
    }
    return frozenState({
      phase: 'pull',
      diveStartAltitude: startAltitude,
      lowAltitude,
      diveFrames: Math.max(2, Number.isInteger(state?.diveFrames) ? state.diveFrames : 2),
      diveEstablished: true,
    });
  }

  const startAltitude = finite(state?.diveStartAltitude);
  const lowAltitude = finite(state?.lowAltitude);
  const climbBaseAltitude = finite(state?.climbBaseAltitude);
  const priorPeak = finite(state?.climbPeakAltitude);
  if (startAltitude == null || lowAltitude == null || climbBaseAltitude == null || priorPeak == null) return reset(false);
  if (sample.speed < 22 || airClass === 'dive' || sample.verticalSpeed < -4) return reset(false);

  const climbPeakAltitude = Math.max(priorPeak, sample.altitude);
  const altitudeLoss = Math.max(0, startAltitude - lowAltitude);
  const recovered = Math.max(0, climbPeakAltitude - lowAltitude);
  const requiredRecovery = Math.max(22, altitudeLoss * 0.55);
  if (airClass === 'climb' && sample.verticalSpeed >= 6 && recovered >= requiredRecovery) return reset(true);

  return frozenState({
    phase: 'climb',
    diveStartAltitude: startAltitude,
    lowAltitude,
    diveFrames: Math.max(2, Number.isInteger(state?.diveFrames) ? state.diveFrames : 2),
    diveEstablished: true,
    climbBaseAltitude,
    climbPeakAltitude,
  });
}

export function divePullClimbPublicState(state, frame = {}) {
  const sample = eligibleFrame(frame);
  const completed = state?.completed === true;
  const phase = PUBLIC_PHASES.includes(state?.phase) ? state.phase : null;
  return Object.freeze({
    available: Boolean(sample && !completed),
    active: Boolean(sample && !completed && phase),
    phase: sample && !completed ? phase : null,
    completed,
  });
}
