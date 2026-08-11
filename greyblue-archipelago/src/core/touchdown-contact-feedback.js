const KINDS = new Set(['none', 'soft', 'firm', 'impact']);

export function createTouchdownContactFeedbackState() {
  return Object.freeze({ active: false, kind: 'none', contactLatched: false });
}

export function stepTouchdownContactFeedback(state = createTouchdownContactFeedbackState(), frame = {}) {
  const prior = normalizeState(state);
  const interrupted = frame?.ready !== true
    || frame?.paused === true
    || frame?.restorePublishing === true
    || frame?.recovery === true;
  if (interrupted) return createTouchdownContactFeedbackState();

  const reason = typeof frame?.collisionReason === 'string' ? frame.collisionReason : '';
  const grounded = frame?.grounded === true;
  const airborne = frame?.airborne === true && !grounded;
  const speed = Number(frame?.speed);
  const finiteSpeed = Number.isFinite(speed) && speed >= 0 ? speed : null;

  if (airborne || reason === 'clear') {
    return Object.freeze({ active: false, kind: 'none', contactLatched: false });
  }

  const contactKind = classifyContact({ reason, grounded, speed: finiteSpeed });
  if (contactKind === 'none') {
    return Object.freeze({ active: false, kind: 'none', contactLatched: prior.contactLatched && grounded });
  }
  if (prior.contactLatched) {
    return Object.freeze({ active: false, kind: 'none', contactLatched: true });
  }
  return Object.freeze({ active: true, kind: contactKind, contactLatched: true });
}

export function publicTouchdownContactFeedback(state = createTouchdownContactFeedbackState()) {
  const normalized = normalizeState(state);
  return Object.freeze({ active: normalized.active, kind: normalized.active ? normalized.kind : 'none' });
}

function classifyContact({ reason, grounded, speed }) {
  if (reason === 'terrain-impact' || reason === 'snag-escape') return 'impact';
  if (reason !== 'touchdown' || !grounded) return 'none';
  if (!Number.isFinite(speed)) return 'firm';
  return speed <= 12 ? 'soft' : 'firm';
}

function normalizeState(state) {
  const kind = KINDS.has(state?.kind) ? state.kind : 'none';
  const active = state?.active === true && kind !== 'none';
  return Object.freeze({ active, kind: active ? kind : 'none', contactLatched: state?.contactLatched === true });
}
