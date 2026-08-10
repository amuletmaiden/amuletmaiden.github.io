const MIN_STEP = 24;
const MIN_DEPART_TRAVEL = 240;
const DEPART_MARGIN = 120;

function finitePosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y ?? 0) && Number.isFinite(position.z);
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function discoveredSet(values) {
  if (values instanceof Set) return new Set(values);
  return new Set(Array.isArray(values) ? values : []);
}

function surveyOuter(island) {
  const authoredRadius = Number(island?.radius);
  const radius = Number.isFinite(authoredRadius) && authoredRadius > 0 ? authoredRadius : 180;
  return Math.max(980, radius * 4.2);
}

function landingContains(island, position) {
  if (!finitePosition(position)) return false;
  const zones = Array.isArray(island?.landingZones) ? island.landingZones : [];
  return zones.some((zone) => {
    if (!Number.isFinite(zone?.x) || !Number.isFinite(zone?.z) || !Number.isFinite(zone?.radius) || zone.radius <= 0) return false;
    const horizontal = Math.hypot(position.x - zone.x, position.z - zone.z);
    const vertical = Number.isFinite(zone?.y) ? Math.abs((position.y ?? zone.y) - zone.y) : 0;
    return horizontal <= zone.radius && vertical <= Math.max(30, zone.radius * 0.45);
  });
}

function idle(completed = false) {
  return {
    available: false,
    active: false,
    phase: completed ? 'settle' : null,
    completed,
    islandId: '',
    pathTravel: 0,
    departed: false,
    lastPosition: null,
  };
}

export function createSurveyToLandingSortieState() {
  return idle(false);
}

export function advanceSurveyToLandingSortie(previous, {
  surveyCompleted = false,
  surveyIsland,
  discoveredIslandIds = [],
  currentRegionId,
  position,
  ready = true,
  paused = false,
  airborne = true,
  recoveryActive = false,
  restorePublishing = false,
  crossingActive = false,
  precisionTouchdownCompleted = false,
  touchdownIslandId = '',
  landedPosition,
} = {}) {
  const prior = previous ?? createSurveyToLandingSortieState();
  if (prior.completed === true) return prior;

  const islandId = cleanId(surveyIsland?.id);
  const regionId = cleanId(currentRegionId);
  const validIsland = islandId && regionId && surveyIsland?.regionId === regionId && Number.isFinite(surveyIsland?.x) && Number.isFinite(surveyIsland?.z) && discoveredSet(discoveredIslandIds).has(islandId);

  if (ready !== true || paused === true || recoveryActive === true || restorePublishing === true || crossingActive === true || !validIsland || !finitePosition(position)) {
    return idle(false);
  }

  if (prior.active !== true) {
    if (surveyCompleted !== true || airborne !== true) return idle(false);
    return {
      available: true,
      active: true,
      phase: 'depart',
      completed: false,
      islandId,
      pathTravel: 0,
      departed: false,
      lastPosition: { x: position.x, y: position.y ?? 0, z: position.z },
    };
  }

  if (cleanId(prior.islandId) !== islandId || !finitePosition(prior.lastPosition)) return idle(false);

  const step = Math.hypot(position.x - prior.lastPosition.x, position.z - prior.lastPosition.z);
  const pathTravel = Number.isFinite(step) && step >= MIN_STEP ? prior.pathTravel + step : prior.pathTravel;
  const radialDistance = Math.hypot(position.x - surveyIsland.x, position.z - surveyIsland.z);
  const departed = prior.departed === true || (pathTravel >= MIN_DEPART_TRAVEL && radialDistance >= surveyOuter(surveyIsland) + DEPART_MARGIN);

  if (precisionTouchdownCompleted === true) {
    const touchdownMatches = cleanId(touchdownIslandId) === islandId;
    const validLanding = departed && touchdownMatches && airborne === false && landingContains(surveyIsland, landedPosition ?? position);
    if (validLanding) {
      return {
        ...prior,
        available: true,
        active: false,
        phase: 'settle',
        completed: true,
        pathTravel,
        departed: true,
        lastPosition: { x: position.x, y: position.y ?? 0, z: position.z },
      };
    }
    return idle(false);
  }

  return {
    ...prior,
    available: true,
    active: true,
    phase: departed ? 'return' : 'depart',
    pathTravel,
    departed,
    lastPosition: { x: position.x, y: position.y ?? 0, z: position.z },
  };
}

export function surveyToLandingSortiePublicState(state) {
  const completed = state?.completed === true;
  const phase = completed ? 'settle' : state?.active === true && ['depart', 'return'].includes(state?.phase) ? state.phase : null;
  const active = !completed && phase !== null;
  return Object.freeze({
    available: completed || active,
    active,
    phase,
    completed,
  });
}
