const RUN_CLASSES = Object.freeze(['water', 'mist']);
const PHASES = Object.freeze(['entry', 'sustained', 'final']);
const STEP_DISTANCE = 26;
const REQUIRED_STEPS = 5;

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cleanClass(value) {
  return RUN_CLASSES.includes(value) ? value : null;
}

function cleanProgress(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(REQUIRED_STEPS, value)) : 0;
}

function reset(completed = false) {
  return Object.freeze({ runClass: null, progress: 0, anchor: null, completed: Boolean(completed) });
}

export function createLowFlightSurfaceRunState() {
  return reset(false);
}

export function stepLowFlightSurfaceRun({ state, wakeState, interrupted = false } = {}) {
  const completed = state?.completed === true;
  if (completed) return reset(true);
  if (interrupted === true) return reset(false);

  const runClass = cleanClass(wakeState?.wakeClass);
  const samples = Array.isArray(wakeState?.samples) ? wakeState.samples : [];
  const newest = point(samples[samples.length - 1]);
  if (!runClass || !newest) return reset(false);

  const priorClass = cleanClass(state?.runClass);
  const priorAnchor = point(state?.anchor);
  const priorProgress = cleanProgress(state?.progress);
  if (priorClass && priorClass !== runClass) {
    return Object.freeze({ runClass, progress: 1, anchor: newest, completed: false });
  }
  if (!priorAnchor) {
    return Object.freeze({ runClass, progress: 1, anchor: newest, completed: false });
  }
  if (distance(priorAnchor, newest) < STEP_DISTANCE) {
    return Object.freeze({ runClass, progress: priorProgress || 1, anchor: priorAnchor, completed: false });
  }

  const progress = Math.min(REQUIRED_STEPS, Math.max(1, priorProgress) + 1);
  return Object.freeze({ runClass, progress, anchor: newest, completed: progress >= REQUIRED_STEPS });
}

export function lowFlightSurfaceRunPublicState(state, wakeState) {
  const runClass = cleanClass(state?.runClass);
  const progress = cleanProgress(state?.progress);
  const completed = state?.completed === true;
  const available = Boolean(cleanClass(wakeState?.wakeClass));
  let phase = null;
  if (runClass && !completed) phase = progress >= 4 ? 'final' : progress >= 2 ? 'sustained' : 'entry';
  return Object.freeze({
    available,
    active: Boolean(runClass && !completed),
    phase: PHASES.includes(phase) ? phase : null,
    completed,
    runClass: runClass ?? null,
  });
}
