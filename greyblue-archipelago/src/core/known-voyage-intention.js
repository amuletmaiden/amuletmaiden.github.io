const PHASES = new Set(['idle', 'depart', 'underway', 'arrived']);
let latestPrivateTarget = null;

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function publishPrivateTarget(state) {
  const targetId = cleanId(state?.targetId);
  const targetRegionId = cleanId(state?.targetRegionId);
  if (!targetId || !targetRegionId || state?.phase === 'idle' || state?.phase === 'arrived') {
    latestPrivateTarget = null;
    return;
  }
  latestPrivateTarget = Object.freeze({ id: targetId, regionId: targetRegionId });
}

export function getPrivateKnownVoyageTarget() {
  return latestPrivateTarget;
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
  const selected = Object.freeze({ targetId: id, targetName: name, targetRegionId: regionId, phase: 'depart', departed: false, completed: false });
  publishPrivateTarget(selected);
  return selected;
}

export function cancelKnownVoyageIntention() {
  latestPrivateTarget = null;
  return createKnownVoyageIntentionState();
}

export function stepKnownVoyageIntention(state = createKnownVoyageIntentionState(), frame = {}) {
  if (!state?.targetId || state.phase === 'idle') {
    latestPrivateTarget = null;
    return createKnownVoyageIntentionState();
  }
  if (frame?.recovery === true || frame?.restorePublishing === true) {
    latestPrivateTarget = null;
    return createKnownVoyageIntentionState();
  }
  if (frame?.ready !== true || frame?.paused === true) {
    publishPrivateTarget(state);
    return state;
  }

  const currentRegionId = cleanId(frame?.currentRegionId);
  const nearestIslandId = cleanId(frame?.nearestIslandId);
  const airborne = frame?.airborne === true && frame?.grounded !== true;
  const ordinaryDeparture = airborne && frame?.ordinaryFlight === true && nearestIslandId !== state.targetId;

  if (!state.departed) {
    if (!ordinaryDeparture) {
      publishPrivateTarget(state);
      return state;
    }
    const underway = Object.freeze({ ...state, phase: 'underway', departed: true });
    publishPrivateTarget(underway);
    return underway;
  }

  const truthfulArrival = currentRegionId === state.targetRegionId
    && nearestIslandId === state.targetId
    && frame?.arrivedAtNearestIsland === true
    && frame?.ordinaryFlight === true;
  if (!truthfulArrival) {
    publishPrivateTarget(state);
    return state;
  }

  const arrived = Object.freeze({ ...state, phase: 'arrived', completed: true });
  latestPrivateTarget = null;
  return arrived;
}

export function publicKnownVoyageIntention(state = createKnownVoyageIntentionState()) {
  publishPrivateTarget(state);
  const phase = PHASES.has(state?.phase) ? state.phase : 'idle';
  const active = Boolean(state?.targetId) && phase !== 'idle' && phase !== 'arrived';
  const completed = phase === 'arrived' && state?.completed === true;
  let text = '';
  if (phase === 'depart') text = 'Take wing when you are ready.';
  else if (phase === 'underway') text = 'Follow your own reading of the archipelago.';
  else if (phase === 'arrived') text = 'Voyage complete.';
  return Object.freeze({ active, phase, completed, text });
}
