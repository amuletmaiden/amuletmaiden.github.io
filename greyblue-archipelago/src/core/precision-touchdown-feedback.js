const RESPONSE_CLASSES = Object.freeze(new Set(['settled']));

export function createPrecisionTouchdownFeedbackState() {
  return Object.freeze({ consumed: false, active: false, responseClass: null });
}

function validCompletion(detail) {
  if (!detail || typeof detail !== 'object') return false;
  if (detail.completed !== true) return false;
  if ('soundHook' in detail && detail.soundHook !== 'precision-touchdown') return false;
  return true;
}

export function consumePrecisionTouchdownCompletion(state, detail) {
  const current = state && typeof state === 'object' ? state : createPrecisionTouchdownFeedbackState();
  if (current.consumed === true || !validCompletion(detail)) return current;
  return Object.freeze({ consumed: true, active: true, responseClass: 'settled' });
}

export function clearPrecisionTouchdownFeedback(state) {
  const current = state && typeof state === 'object' ? state : createPrecisionTouchdownFeedbackState();
  if (current.consumed !== true) return createPrecisionTouchdownFeedbackState();
  return Object.freeze({ consumed: true, active: false, responseClass: null });
}

export function precisionTouchdownFeedbackPublicState(state) {
  const active = state?.active === true;
  const responseClass = active && RESPONSE_CLASSES.has(state?.responseClass) ? state.responseClass : null;
  return Object.freeze({ active, responseClass });
}
