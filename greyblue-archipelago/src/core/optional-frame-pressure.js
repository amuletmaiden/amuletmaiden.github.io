const PRESSURE_CLASSES = new Set(['strained', 'critical']);
const MAX_SAMPLE_MS = 250;
const STRAINED_SAMPLE_MS = 28;
const CRITICAL_SAMPLE_MS = 45;
const STRAINED_ENTER_MS = 480;
const CRITICAL_ENTER_MS = 300;
const RECOVERY_MS = 900;

function finiteSample(deltaMs) {
  return Number.isFinite(deltaMs) && deltaMs >= 0 && deltaMs <= MAX_SAMPLE_MS;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createOptionalFramePressureState() {
  return Object.freeze({
    pressureClass: null,
    strainedEvidenceMs: 0,
    criticalEvidenceMs: 0,
    healthyEvidenceMs: 0,
  });
}

export function stepOptionalFramePressure(state = createOptionalFramePressureState(), { deltaMs } = {}) {
  const current = {
    pressureClass: PRESSURE_CLASSES.has(state?.pressureClass) ? state.pressureClass : null,
    strainedEvidenceMs: Number.isFinite(state?.strainedEvidenceMs) ? clamp(state.strainedEvidenceMs, 0, STRAINED_ENTER_MS) : 0,
    criticalEvidenceMs: Number.isFinite(state?.criticalEvidenceMs) ? clamp(state.criticalEvidenceMs, 0, CRITICAL_ENTER_MS) : 0,
    healthyEvidenceMs: Number.isFinite(state?.healthyEvidenceMs) ? clamp(state.healthyEvidenceMs, 0, RECOVERY_MS) : 0,
  };

  if (!finiteSample(deltaMs)) return Object.freeze(current);

  const critical = deltaMs >= CRITICAL_SAMPLE_MS;
  const strained = deltaMs >= STRAINED_SAMPLE_MS;
  const healthy = !strained;

  if (critical) {
    current.criticalEvidenceMs = clamp(current.criticalEvidenceMs + deltaMs, 0, CRITICAL_ENTER_MS);
    current.strainedEvidenceMs = clamp(current.strainedEvidenceMs + deltaMs, 0, STRAINED_ENTER_MS);
    current.healthyEvidenceMs = 0;
  } else if (strained) {
    current.strainedEvidenceMs = clamp(current.strainedEvidenceMs + deltaMs, 0, STRAINED_ENTER_MS);
    current.criticalEvidenceMs = clamp(current.criticalEvidenceMs - deltaMs * 0.75, 0, CRITICAL_ENTER_MS);
    current.healthyEvidenceMs = 0;
  } else if (healthy) {
    current.healthyEvidenceMs = clamp(current.healthyEvidenceMs + deltaMs, 0, RECOVERY_MS);
    current.strainedEvidenceMs = clamp(current.strainedEvidenceMs - deltaMs * 0.6, 0, STRAINED_ENTER_MS);
    current.criticalEvidenceMs = clamp(current.criticalEvidenceMs - deltaMs, 0, CRITICAL_ENTER_MS);
  }

  if (current.criticalEvidenceMs >= CRITICAL_ENTER_MS) {
    current.pressureClass = 'critical';
    current.healthyEvidenceMs = 0;
  } else if (current.pressureClass !== 'critical' && current.strainedEvidenceMs >= STRAINED_ENTER_MS) {
    current.pressureClass = 'strained';
    current.healthyEvidenceMs = 0;
  }

  if (current.pressureClass && current.healthyEvidenceMs >= RECOVERY_MS) {
    current.pressureClass = null;
    current.strainedEvidenceMs = 0;
    current.criticalEvidenceMs = 0;
    current.healthyEvidenceMs = 0;
  }

  return Object.freeze(current);
}

export function optionalPresentationBudget(state, { reducedMotion = false } = {}) {
  const pressureClass = PRESSURE_CLASSES.has(state?.pressureClass) ? state.pressureClass : null;
  const base = pressureClass === 'critical'
    ? { historyScale: 0.25, animationScale: 0.35, optionalCueCapScale: 0.45 }
    : pressureClass === 'strained'
      ? { historyScale: 0.55, animationScale: 0.65, optionalCueCapScale: 0.7 }
      : { historyScale: 1, animationScale: 1, optionalCueCapScale: 1 };

  if (!reducedMotion) return Object.freeze(base);
  return Object.freeze({
    historyScale: Math.min(base.historyScale, 0.35),
    animationScale: Math.min(base.animationScale, 0.45),
    optionalCueCapScale: base.optionalCueCapScale,
  });
}

export function publicOptionalFramePressureState(state) {
  const pressureClass = PRESSURE_CLASSES.has(state?.pressureClass) ? state.pressureClass : null;
  return Object.freeze({
    active: Boolean(pressureClass),
    pressureClass,
  });
}
