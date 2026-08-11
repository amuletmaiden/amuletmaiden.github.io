const PHASES = new Set(['idle', 'depart', 'underway', 'arrived']);

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

export function createKnownVoyageIntentionState() {
  return Object.freeze({ targetId: null, targetName: null, targetRegionId: null, phase: 'idle', departed: false, completed: false });
}

export function selectKnownVoyageIntention({ state = createKnownVoyageIntentionState(), candidate = null, knownNodes = [] } = {}) {
  const id = cleanId(candidate?.id);
  const known = (Array.isArray(knownNodes) ? knownNodes : []).find((node) => cleanId(node?.id) === id);
  if (!id || !known) return state;
  const name = cleanName(known.name);
  const regionId = cleanId(known.regionId || candidate?.regionId);
  if (!name || !regionId) return state;
  return Object.freeze({ targetId: id, targetName: name, targetRegionId: regionId, phase: 'depart', departed: false, completed: false });
}

export function cancelKnownVoyageIntention() {
  return createKnownVoyageIntentionState();
}

export function stepKnownVoyageIntention(state = createKnownVoyageIntentionState(), frame = {}) {
  if (!state?.targetId || state.phase === 'idle') return createKnownVoyageIntentionState();
  if (frame?.recovery === true || frame?.restorePublishing === true) return createKnownVoyageIntentionState();
  if (frame?.ready !== true || frame?.paused === true) return state;

  const currentRegionId = cleanId(frame?.currentRegionId);
  const nearestIslandId = cleanId(frame?.nearestIslandId);
  const airborne = frame?.airborne === true && frame?.grounded !== true;
  const ordinaryDeparture = airborne && frame?.ordinaryFlight === true && nearestIslandId !== state.targetId;

  if (!state.departed) {
    if (!ordinaryDeparture) return state;
    return Object.freeze({ ...state, phase: 'underway', departed: true });
  }

  const truthfulArrival = currentRegionId === state.targetRegionId
    && nearestIslandId === state.targetId
    && frame?.arrivedAtNearestIsland === true
    && frame?.ordinaryFlight === true;
  if (!truthfulArrival) return state;

  return Object.freeze({ ...state, phase: 'arrived', completed: true });
}

export function publicKnownVoyageIntention(state = createKnownVoyageIntentionState()) {
  const phase = PHASES.has(state?.phase) ? state.phase : 'idle';
  const active = Boolean(state?.targetId) && phase !== 'idle' && phase !== 'arrived';
  const completed = phase === 'arrived' && state?.completed === true;
  let text = '';
  if (phase === 'depart') text = 'Take wing when you are ready.';
  else if (phase === 'underway') text = 'Follow your own reading of the archipelago.';
  else if (phase === 'arrived') text = 'Voyage complete.';
  return Object.freeze({ active, phase, completed, text });
}
