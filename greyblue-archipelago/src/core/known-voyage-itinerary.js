const MAX_STOPS = 2;
const PHASES = new Set(['idle', 'planning', 'first-leg', 'second-leg', 'complete']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function cleanName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function freezeStops(stops) {
  return Object.freeze(stops.map((stop) => Object.freeze({ ...stop })));
}

export function createKnownVoyageItineraryState() {
  return Object.freeze({ stops: Object.freeze([]), activeIndex: -1, launched: false, completed: false });
}

export function addKnownVoyageItineraryStop({ state = createKnownVoyageItineraryState(), candidate = null, knownNodes = [] } = {}) {
  if (state?.launched === true || state?.completed === true) return state;
  const id = cleanId(candidate?.id);
  const known = (Array.isArray(knownNodes) ? knownNodes : []).find((node) => cleanId(node?.id) === id);
  if (!id || !known || state.stops.length >= MAX_STOPS || state.stops.some((stop) => stop.id === id)) return state;
  const name = cleanName(known?.name);
  const regionId = cleanId(known?.regionId);
  if (!name || !regionId) return state;
  return Object.freeze({ ...state, stops: freezeStops([...state.stops, { id, name, regionId }]) });
}

export function removeKnownVoyageItineraryStop(state = createKnownVoyageItineraryState(), stopId = '') {
  if (state?.launched === true || state?.completed === true) return state;
  const id = cleanId(stopId);
  if (!id) return state;
  const nextStops = state.stops.filter((stop) => stop.id !== id);
  if (nextStops.length === state.stops.length) return state;
  return Object.freeze({ ...state, stops: freezeStops(nextStops) });
}

export function reverseKnownVoyageItinerary(state = createKnownVoyageItineraryState()) {
  if (state?.launched === true || state?.completed === true || state?.stops?.length !== 2) return state;
  return Object.freeze({ ...state, stops: freezeStops([...state.stops].reverse()) });
}

export function launchKnownVoyageItinerary(state = createKnownVoyageItineraryState()) {
  if (state?.launched === true || state?.completed === true || !Array.isArray(state?.stops) || state.stops.length < 1) return state;
  return Object.freeze({ ...state, activeIndex: 0, launched: true, completed: false });
}

export function currentKnownVoyageItineraryStop(state = createKnownVoyageItineraryState()) {
  if (state?.launched !== true || !Number.isInteger(state?.activeIndex)) return null;
  const stop = state.stops[state.activeIndex];
  return stop ? Object.freeze({ ...stop }) : null;
}

export function advanceKnownVoyageItinerary(state = createKnownVoyageItineraryState(), voyageEvent = null) {
  if (state?.launched !== true || state?.completed === true) return state;
  const truthfulCompletion = voyageEvent?.event === 'completed'
    && voyageEvent?.completed === true
    && voyageEvent?.phase === 'arrived';
  if (!truthfulCompletion) return state;
  const nextIndex = state.activeIndex + 1;
  if (nextIndex < state.stops.length) return Object.freeze({ ...state, activeIndex: nextIndex });
  return Object.freeze({ ...state, launched: false, completed: true });
}

export function cancelKnownVoyageItinerary() {
  return createKnownVoyageItineraryState();
}

export function resetKnownVoyageItineraryForInterruption(state = createKnownVoyageItineraryState(), frame = {}) {
  if (frame?.recovery === true || frame?.restorePublishing === true) return createKnownVoyageItineraryState();
  return state;
}

export function publicKnownVoyageItinerary(state = createKnownVoyageItineraryState()) {
  let phase = 'idle';
  if (state?.completed === true) phase = 'complete';
  else if (state?.launched === true && state?.activeIndex === 0) phase = 'first-leg';
  else if (state?.launched === true && state?.activeIndex === 1) phase = 'second-leg';
  else if (Array.isArray(state?.stops) && state.stops.length > 0) phase = 'planning';
  if (!PHASES.has(phase)) phase = 'idle';
  return Object.freeze({
    active: phase === 'first-leg' || phase === 'second-leg',
    phase,
    completed: phase === 'complete',
  });
}
