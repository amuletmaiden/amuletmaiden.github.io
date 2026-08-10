const SKIM_CLASSES = Object.freeze(['near', 'close', 'razor']);
const MIN_SPEED = 30;

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function classifyClearance(clearance, priorClass = null) {
  if (priorClass === 'razor' && clearance <= 15) return 'razor';
  if (priorClass === 'close' && clearance <= 27) return clearance <= 12 ? 'razor' : 'close';
  if (priorClass === 'near' && clearance <= 43) {
    if (clearance <= 12) return 'razor';
    if (clearance <= 24) return 'close';
    return 'near';
  }
  if (clearance <= 12) return 'razor';
  if (clearance <= 24) return 'close';
  if (clearance <= 38) return 'near';
  return null;
}

function cleanFrame(frame = {}) {
  const y = finite(frame?.position?.y);
  const surfaceHeight = finite(frame?.surfaceHeight);
  const speed = finite(frame?.speed);
  if (frame?.ready !== true
    || frame?.paused === true
    || frame?.airborne !== true
    || frame?.recoveryActive === true
    || frame?.restorePublishing === true
    || y == null
    || surfaceHeight == null
    || speed == null
    || speed < MIN_SPEED
    || typeof frame?.surface !== 'string'
    || frame.surface.length === 0
    || frame.surface === 'water') return null;
  const clearance = y - surfaceHeight;
  if (!Number.isFinite(clearance) || clearance < 0) return null;
  return Object.freeze({ clearance, speed });
}

export function createTerrainSkimPressureState() {
  return Object.freeze({ skimClass: null });
}

export function stepTerrainSkimPressure({ state = createTerrainSkimPressureState(), frame = {} } = {}) {
  const sample = cleanFrame(frame);
  if (!sample) return createTerrainSkimPressureState();
  const priorClass = SKIM_CLASSES.includes(state?.skimClass) ? state.skimClass : null;
  return Object.freeze({ skimClass: classifyClearance(sample.clearance, priorClass) });
}

export function terrainSkimPressurePublicState(state) {
  const skimClass = SKIM_CLASSES.includes(state?.skimClass) ? state.skimClass : null;
  return Object.freeze({ active: Boolean(skimClass), skimClass });
}

export function terrainSkimPressurePresentation(state, { highContrast = false, reducedMotion = false } = {}) {
  const skimClass = SKIM_CLASSES.includes(state?.skimClass) ? state.skimClass : null;
  const strength = skimClass === 'razor' ? 1 : skimClass === 'close' ? 0.7 : skimClass === 'near' ? 0.42 : 0;
  return Object.freeze({
    active: Boolean(skimClass),
    skimClass,
    gain: Math.min(0.12, strength * (highContrast === true ? 0.12 : 0.09)),
    filterHz: skimClass === 'razor' ? 1320 : skimClass === 'close' ? 1040 : skimClass === 'near' ? 820 : 0,
    responseSeconds: reducedMotion === true ? 0.05 : 0.12,
  });
}
