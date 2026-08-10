const SIDES = Object.freeze(['left', 'right']);
const PHASES = Object.freeze(['first', 'cross', 'reverse']);

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function cleanPoint(point) {
  const x = finite(point?.x);
  const y = finite(point?.y);
  const z = finite(point?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function directionFor(side) {
  if (side === 'left') return 'left-right';
  if (side === 'right') return 'right-left';
  return null;
}

function frozenState(overrides = {}) {
  return Object.freeze({
    phase: 'idle',
    firstSide: null,
    lastPosition: null,
    firstDistance: 0,
    crossDistance: 0,
    reverseDistance: 0,
    firstFrames: 0,
    crossFrames: 0,
    reverseFrames: 0,
    crossEstablished: false,
    completed: false,
    ...overrides,
  });
}

export function createLinkedBankReversalState() {
  return frozenState();
}

function reset(completed = false, firstSide = null) {
  return frozenState({
    completed,
    firstSide: completed && SIDES.includes(firstSide) ? firstSide : null,
  });
}

function eligibleFrame(frame) {
  const speed = finite(frame?.speed);
  const position = cleanPoint(frame?.position);
  if (frame?.ready !== true
    || frame?.paused === true
    || frame?.airborne !== true
    || frame?.recoveryActive === true
    || frame?.restorePublishing === true
    || speed == null
    || speed < 28
    || !position) return null;
  return Object.freeze({ speed, position });
}

function cleanArc(arc) {
  const side = SIDES.includes(arc?.turnClass) ? arc.turnClass : null;
  return Object.freeze({ active: arc?.active === true && side != null, side });
}

export function stepLinkedBankReversal({
  state = createLinkedBankReversalState(),
  frame = {},
  bankArc = {},
} = {}) {
  if (state?.completed === true) return reset(true, state?.firstSide);
  const sample = eligibleFrame(frame);
  if (!sample) return reset(false);
  const arc = cleanArc(bankArc);
  const phase = PHASES.includes(state?.phase) ? state.phase : 'idle';

  if (phase === 'idle') {
    if (!arc.active) return reset(false);
    return frozenState({
      phase: 'first',
      firstSide: arc.side,
      lastPosition: sample.position,
      firstFrames: 1,
    });
  }

  const prior = cleanPoint(state?.lastPosition);
  if (!prior) return reset(false);
  const travelled = distance(prior, sample.position);
  const firstSide = SIDES.includes(state?.firstSide) ? state.firstSide : null;
  if (!firstSide) return reset(false);

  if (phase === 'first') {
    if (!arc.active) {
      const firstDistance = Math.max(0, finite(state?.firstDistance) ?? 0);
      const firstFrames = Math.max(0, Number.isInteger(state?.firstFrames) ? state.firstFrames : 0);
      if (firstFrames < 2 || firstDistance < 12) return reset(false);
      return frozenState({
        phase: 'cross',
        firstSide,
        lastPosition: sample.position,
        firstDistance,
        firstFrames,
        crossDistance: travelled,
        crossFrames: 1,
        crossEstablished: travelled >= 10,
      });
    }
    if (arc.side !== firstSide) return reset(false);
    return frozenState({
      phase: 'first',
      firstSide,
      lastPosition: sample.position,
      firstDistance: Math.max(0, finite(state?.firstDistance) ?? 0) + travelled,
      firstFrames: Math.max(0, Number.isInteger(state?.firstFrames) ? state.firstFrames : 0) + 1,
    });
  }

  if (phase === 'cross') {
    const firstDistance = Math.max(0, finite(state?.firstDistance) ?? 0);
    const firstFrames = Math.max(2, Number.isInteger(state?.firstFrames) ? state.firstFrames : 2);
    const priorCross = Math.max(0, finite(state?.crossDistance) ?? 0);
    const crossFrames = Math.max(0, Number.isInteger(state?.crossFrames) ? state.crossFrames : 0);
    const crossDistance = priorCross + travelled;
    const nextCrossFrames = crossFrames + 1;
    const established = state?.crossEstablished === true || (nextCrossFrames >= 2 && crossDistance >= 10);

    if (!arc.active) {
      return frozenState({
        phase: 'cross',
        firstSide,
        lastPosition: sample.position,
        firstDistance,
        firstFrames,
        crossDistance,
        crossFrames: nextCrossFrames,
        crossEstablished: established,
      });
    }

    if (arc.side === firstSide) {
      if (established) return reset(false);
      return frozenState({
        phase: 'first',
        firstSide,
        lastPosition: sample.position,
        firstDistance: firstDistance + travelled,
        firstFrames: firstFrames + 1,
      });
    }

    if (!established) return reset(false);
    return frozenState({
      phase: 'reverse',
      firstSide,
      lastPosition: sample.position,
      firstDistance,
      firstFrames,
      crossDistance,
      crossFrames: nextCrossFrames,
      crossEstablished: true,
      reverseDistance: travelled,
      reverseFrames: 1,
    });
  }

  const opposite = firstSide === 'left' ? 'right' : 'left';
  if (!arc.active || arc.side !== opposite) return reset(false);
  const reverseDistance = Math.max(0, finite(state?.reverseDistance) ?? 0) + travelled;
  const reverseFrames = Math.max(0, Number.isInteger(state?.reverseFrames) ? state.reverseFrames : 0) + 1;
  if (reverseFrames >= 2 && reverseDistance >= 14) return reset(true, firstSide);

  return frozenState({
    phase: 'reverse',
    firstSide,
    lastPosition: sample.position,
    firstDistance: Math.max(0, finite(state?.firstDistance) ?? 0),
    firstFrames: Math.max(2, Number.isInteger(state?.firstFrames) ? state.firstFrames : 2),
    crossDistance: Math.max(10, finite(state?.crossDistance) ?? 10),
    crossFrames: Math.max(2, Number.isInteger(state?.crossFrames) ? state.crossFrames : 2),
    crossEstablished: true,
    reverseDistance,
    reverseFrames,
  });
}

export function linkedBankReversalPublicState(state, frame = {}) {
  const sample = eligibleFrame(frame);
  const completed = state?.completed === true;
  const phase = PHASES.includes(state?.phase) ? state.phase : null;
  const direction = directionFor(state?.firstSide);
  return Object.freeze({
    available: Boolean(sample && !completed),
    active: Boolean(sample && !completed && phase),
    phase: sample && !completed ? phase : null,
    completed,
    direction: phase || completed ? direction : null,
  });
}
