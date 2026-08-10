export function createTouchAndGoFeedbackState() {
  return Object.freeze({ consumed: false, active: false });
}

export function consumeTouchAndGoCompletion(state, detail) {
  const current = state && typeof state === 'object' ? state : createTouchAndGoFeedbackState();
  if (current.consumed === true) return current;
  if (!detail || typeof detail !== 'object' || detail.completed !== true) return current;
  return Object.freeze({ consumed: true, active: true });
}

export function clearTouchAndGoFeedback(state) {
  const current = state && typeof state === 'object' ? state : createTouchAndGoFeedbackState();
  if (current.active !== true) return current;
  return Object.freeze({ consumed: current.consumed === true, active: false });
}

export function touchAndGoFeedbackPublicState(state) {
  return Object.freeze({
    active: state?.active === true,
    responseClass: state?.active === true ? 'lifted' : null,
  });
}
