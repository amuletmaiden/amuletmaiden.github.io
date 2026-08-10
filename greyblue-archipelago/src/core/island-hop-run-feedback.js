export function createIslandHopFeedbackState() {
  return Object.freeze({ active: false, consumed: false, responseClass: null });
}

export function consumeIslandHopCompletion(state, detail) {
  const current = state && typeof state === 'object' ? state : createIslandHopFeedbackState();
  if (current.consumed || !detail || detail.completed !== true || detail.phase !== 'arrive') return current;
  return Object.freeze({ active: true, consumed: true, responseClass: 'arrived' });
}

export function clearIslandHopFeedback(state) {
  const current = state && typeof state === 'object' ? state : createIslandHopFeedbackState();
  if (!current.active) return current;
  return Object.freeze({ active: false, consumed: current.consumed === true, responseClass: null });
}

export function islandHopFeedbackPublicState(state) {
  return Object.freeze({
    active: state?.active === true,
    responseClass: state?.active === true && state?.responseClass === 'arrived' ? 'arrived' : null,
  });
}
