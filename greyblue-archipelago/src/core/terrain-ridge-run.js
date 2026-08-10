const PHASES = Object.freeze(['entry', 'sustained', 'final']);
const MIN_STEP_DISTANCE = 18;
const REQUIRED_STEPS = 5;

function finitePoint(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  const z = Number(position?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Object.freeze({ x, y, z });
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function eligible(frame = {}) {
  return frame?.ready === true
    && frame?.paused !== true
    && frame?.airborne === true
    && frame?.recoveryActive !== true
    && frame?.restorePublishing !== true
    && frame?.skim?.active === true
    && ['near', 'close', 'razor'].includes(frame?.skim?.skimClass);
}

function phaseForSteps(steps) {
  if (steps >= REQUIRED_STEPS - 1) return 'final';
  if (steps >= 2) return 'sustained';
  return 'entry';
}

export function createTerrainRidgeRunState({ completed = false } = {}) {
  return Object.freeze({
    active: false,
    completed: completed === true,
    steps: 0,
    anchor: null,
    phase: null,
  });
}

export function stepTerrainRidgeRun({ state = createTerrainRidgeRunState(), frame = {} } = {}) {
  if (state?.completed === true) return createTerrainRidgeRunState({ completed: true });
  if (!eligible(frame)) return createTerrainRidgeRunState();
  const point = finitePoint(frame?.position);
  if (!point) return createTerrainRidgeRunState();

  if (state?.active !== true || !finitePoint(state.anchor)) {
    return Object.freeze({ active: true, completed: false, steps: 0, anchor: point, phase: 'entry' });
  }

  const travelled = distance(point, state.anchor);
  if (travelled < MIN_STEP_DISTANCE) return state;

  const steps = Math.max(0, Math.floor(Number(state.steps) || 0)) + 1;
  if (steps >= REQUIRED_STEPS) {
    return Object.freeze({ active: false, completed: true, steps: REQUIRED_STEPS, anchor: null, phase: null });
  }

  return Object.freeze({
    active: true,
    completed: false,
    steps,
    anchor: point,
    phase: phaseForSteps(steps),
  });
}

export function terrainRidgeRunPublicState(state) {
  const completed = state?.completed === true;
  const active = state?.active === true && !completed;
  const phase = active && PHASES.includes(state?.phase) ? state.phase : null;
  return Object.freeze({
    available: active || completed,
    active,
    phase,
    completed,
  });
}
