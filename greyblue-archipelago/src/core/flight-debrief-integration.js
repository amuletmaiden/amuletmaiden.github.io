const COMPLETION_CATEGORIES = Object.freeze({
  'greyblue:mystery-listening-pass': 'mystery',
  'greyblue:regional-mystery-search-flight': 'mystery',
  'greyblue:discovered-island-survey': 'survey',
  'greyblue:survey-to-landing-sortie': 'survey',
  'greyblue:island-hop-run': 'crossing',
  'greyblue:high-air-crossing': 'crossing',
  'greyblue:high-air-landfall': 'crossing',
  'greyblue:cloudbreak-run': 'weather',
  'greyblue:deep-mist-run': 'weather',
  'greyblue:full-column-weather-run': 'weather',
  'greyblue:terrain-ridge-run': 'terrain',
  'greyblue:low-flight-surface-run': 'low-flight',
});

export const FLIGHT_DEBRIEF_COMPLETION_EVENTS = Object.freeze(Object.keys(COMPLETION_CATEGORIES));
export const FLIGHT_DEBRIEF_LANDING_EVENTS = Object.freeze([
  'greyblue:precision-touchdown',
  'greyblue:roost-rest',
]);

export function flightDebriefCategoryForEvent(type, detail) {
  if (typeof type !== 'string' || detail?.completed !== true) return null;
  return COMPLETION_CATEGORIES[type] ?? null;
}

export function flightDebriefRuntimePolicy(state) {
  const airborne = state?.flight?.airborne === true && state?.collision?.grounded !== true;
  const restoring = state?.restorePublishing === true || state?.explorationRestorePublishing === true;
  const recovering = state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery';
  const safe = state?.ready === true && state?.paused !== true && !restoring && !recovering;
  return Object.freeze({ airborne: safe && airborne, safe, restoring, recovering });
}

export function flightDebriefLandingForEvent(type, detail, runtime = {}) {
  if (!runtime.safe || runtime.restoring || runtime.recovering) return false;
  if (type === 'greyblue:precision-touchdown') return detail?.completed === true;
  if (type === 'greyblue:roost-rest') return detail?.resting === true && detail?.beganRest === true;
  return false;
}
