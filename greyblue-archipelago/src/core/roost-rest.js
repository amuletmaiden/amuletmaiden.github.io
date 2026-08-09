const MAX_ID = 120;
const PURPOSES = new Set(['landmark', 'frontier', 'roost', 'familiar']);

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function validAnchor(anchor) {
  const islandId = cleanId(anchor?.islandId);
  const zoneId = cleanId(anchor?.zoneId || anchor?.landingZoneId);
  return islandId && zoneId ? { islandId, zoneId } : null;
}

function departure(expedition) {
  if (!expedition?.active) return null;
  const purpose = PURPOSES.has(expedition.purpose) ? expedition.purpose : null;
  if (!purpose) return null;
  return Object.freeze({ purpose });
}

export function deriveRoostRest({
  earnedRoost = null,
  grounded = false,
  groundedIslandId = null,
  groundedZoneId = null,
  recoveryActive = false,
  movementActive = false,
  crossingActive = false,
  resting = false,
  enterRest = false,
  expedition = null,
  reducedMotion = false,
} = {}) {
  const anchor = validAnchor(earnedRoost);
  const atEarnedRoost = Boolean(anchor)
    && grounded === true
    && cleanId(groundedIslandId) === anchor.islandId
    && cleanId(groundedZoneId) === anchor.zoneId
    && recoveryActive !== true;

  const mustExit = !atEarnedRoost || movementActive === true || crossingActive === true;
  const nextResting = mustExit ? false : (resting === true || enterRest === true);
  const knownDeparture = nextResting ? departure(expedition) : null;

  return Object.freeze({
    available: atEarnedRoost,
    resting: nextResting,
    atmosphere: nextResting ? 'warmth' : 'none',
    departure: knownDeparture,
    reducedMotion: reducedMotion === true,
  });
}

export function roostRestPublicState(state = null) {
  const purpose = PURPOSES.has(state?.departure?.purpose) ? state.departure.purpose : null;
  return Object.freeze({
    available: state?.available === true,
    resting: state?.resting === true,
    atmosphere: state?.resting === true && state?.atmosphere === 'warmth' ? 'warmth' : 'none',
    departureClass: purpose,
  });
}
