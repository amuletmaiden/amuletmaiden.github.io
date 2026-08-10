const MAX_TOUCHDOWN_SPEED = 19;
const MAX_DESCENT_SPEED = 6.5;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function createPrecisionTouchdownState() {
  return Object.freeze({ status: 'idle', shelfId: '', completed: false });
}

export function stepPrecisionTouchdown(state = createPrecisionTouchdownState(), input = {}) {
  if (state?.completed === true) return Object.freeze({ status: 'completed', shelfId: '', completed: true });

  const currentShelfId = cleanId(state?.shelfId);
  const status = state?.status === 'approach' ? 'approach' : 'idle';
  const approachShelfId = cleanId(input?.approachShelfId);
  const touchdownShelfId = cleanId(input?.touchdownShelfId);
  const grounded = input?.grounded === true;
  const interrupted = input?.recoveryActive === true
    || input?.restorePublishing === true
    || input?.crossingActive === true;

  if (interrupted) return createPrecisionTouchdownState();

  if (status === 'idle') {
    const canArm = !grounded
      && approachShelfId
      && input?.approachClass === 'final'
      && finiteNonNegative(input?.speed)
      && finiteNonNegative(input?.descentSpeed);
    return canArm
      ? Object.freeze({ status: 'approach', shelfId: approachShelfId, completed: false })
      : createPrecisionTouchdownState();
  }

  if (!currentShelfId) return createPrecisionTouchdownState();

  if (!grounded) {
    if (approachShelfId !== currentShelfId || input?.approachClass !== 'final') return createPrecisionTouchdownState();
    return Object.freeze({ status: 'approach', shelfId: currentShelfId, completed: false });
  }

  const cleanTouchdown = touchdownShelfId === currentShelfId
    && finiteNonNegative(input?.speed)
    && input.speed <= MAX_TOUCHDOWN_SPEED
    && finiteNonNegative(input?.descentSpeed)
    && input.descentSpeed <= MAX_DESCENT_SPEED;

  return cleanTouchdown
    ? Object.freeze({ status: 'completed', shelfId: '', completed: true })
    : createPrecisionTouchdownState();
}

export function precisionTouchdownPublicState(state, input = {}) {
  const completed = state?.completed === true;
  const active = !completed && state?.status === 'approach' && Boolean(cleanId(state?.shelfId));
  const available = !completed && !active
    && input?.grounded !== true
    && input?.approachClass === 'final'
    && Boolean(cleanId(input?.approachShelfId));

  return Object.freeze({
    available,
    active,
    phase: active ? 'approach' : completed ? 'settle' : null,
    completed,
  });
}
