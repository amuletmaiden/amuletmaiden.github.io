const PHASES = Object.freeze(['depart', 'return', 'listen']);
const DEPART_MARGIN = 180;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function finitePosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? Object.freeze({ x, y, z })
    : null;
}

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createMysteryListeningPassState() {
  return Object.freeze({
    available: false,
    active: false,
    phase: 'depart',
    completed: false,
    focusLandmarkId: null,
    focusRegionId: null,
    focusPosition: null,
    encounterRadius: null,
    departed: false,
  });
}

function reset(available = false) {
  return Object.freeze({ ...createMysteryListeningPassState(), available });
}

export function armMysteryListeningPass(previous, {
  completedArrival = false,
  landmarkId,
  regionId,
  focusPosition,
  encounterRadius,
} = {}) {
  if (previous?.completed === true || previous?.active === true || !completedArrival) return previous ?? reset(false);
  const focusLandmarkId = cleanId(landmarkId);
  const focusRegionId = cleanId(regionId);
  const position = finitePosition(focusPosition);
  const radius = Number(encounterRadius);
  if (!focusLandmarkId || !focusRegionId || !position || !Number.isFinite(radius) || radius <= 0) return reset(false);
  return Object.freeze({
    available: true,
    active: true,
    phase: 'depart',
    completed: false,
    focusLandmarkId,
    focusRegionId,
    focusPosition: position,
    encounterRadius: radius,
    departed: false,
  });
}

export function advanceMysteryListeningPass(previous, {
  ready = false,
  paused = false,
  airborne = false,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  regionId,
  landmarkId,
  position,
  listened = false,
} = {}) {
  if (previous?.completed === true) return previous;
  if (previous?.active !== true) return reset(false);
  const currentPosition = finitePosition(position);
  const currentRegionId = cleanId(regionId);
  const focusRegionId = cleanId(previous.focusRegionId);
  const focusLandmarkId = cleanId(previous.focusLandmarkId);
  const focusPosition = finitePosition(previous.focusPosition);
  const radius = Number(previous.encounterRadius);
  const interrupted = !ready || paused || !airborne || recoveryActive || crossingActive || restorePublishing
    || !currentPosition || !focusPosition || !focusLandmarkId || !focusRegionId
    || currentRegionId !== focusRegionId || !Number.isFinite(radius) || radius <= 0;
  if (interrupted) return reset(false);

  const distance = distance2(currentPosition, focusPosition);
  const outside = distance > radius + DEPART_MARGIN;
  if (!previous.departed) {
    if (listened) return previous;
    if (!outside) return previous;
    return Object.freeze({ ...previous, phase: 'return', departed: true });
  }

  if (outside) return Object.freeze({ ...previous, phase: 'return' });
  if (!listened) return Object.freeze({ ...previous, phase: 'listen' });
  if (cleanId(landmarkId) !== focusLandmarkId) return reset(true);
  return Object.freeze({ ...previous, active: false, phase: 'listen', completed: true });
}

export function mysteryListeningPassPublicState(state) {
  return Object.freeze({
    available: Boolean(state?.available),
    active: Boolean(state?.active),
    phase: PHASES.includes(state?.phase) ? state.phase : 'depart',
    completed: Boolean(state?.completed),
  });
}
