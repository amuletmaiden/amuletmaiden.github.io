const WAKE_CLASSES = Object.freeze(['water', 'mist']);
const MAX_SAMPLES = 10;
const SAMPLE_LIFETIME_MS = 1500;
const MIN_SAMPLE_DISTANCE = 18;
const MIN_SPEED = 24;

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cleanTime(value) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function classifyFrame(frame = {}) {
  const position = point(frame.position);
  const speed = finite(frame.speed);
  const surfaceHeight = finite(frame.surfaceHeight);
  const fogDensity = finite(frame.fogDensity);
  if (!position || speed == null || speed < MIN_SPEED || surfaceHeight == null || fogDensity == null) return null;
  if (frame.ready !== true || frame.paused === true || frame.grounded === true || frame.recoveryActive === true || frame.restorePublishing === true) return null;

  const clearance = Math.max(0, position.y - surfaceHeight);
  if (frame.surface === 'water' && clearance <= 34) {
    return Object.freeze({ wakeClass: 'water', position, surfaceHeight, strength: clamp((34 - clearance) / 34, 0.2, 1) });
  }
  if (fogDensity >= 0.00072 && clearance <= 48) {
    return Object.freeze({ wakeClass: 'mist', position, surfaceHeight, strength: clamp(fogDensity / 0.0012, 0.25, 1) });
  }
  return null;
}

export function createLowFlightWakeState() {
  return Object.freeze({ wakeClass: null, samples: Object.freeze([]) });
}

export function stepLowFlightWake({ state, frame, now = 0, reducedMotion = false } = {}) {
  const time = cleanTime(now);
  const priorSamples = Array.isArray(state?.samples) ? state.samples : [];
  const lifetime = reducedMotion === true ? 420 : SAMPLE_LIFETIME_MS;
  const retained = priorSamples
    .map((sample) => {
      const position = point(sample);
      const occurredAt = cleanTime(sample?.occurredAt);
      const wakeClass = WAKE_CLASSES.includes(sample?.wakeClass) ? sample.wakeClass : null;
      const strength = finite(sample?.strength);
      const surfaceHeight = finite(sample?.surfaceHeight);
      return position && wakeClass && strength != null && surfaceHeight != null
        ? Object.freeze({ ...position, surfaceHeight, occurredAt, wakeClass, strength: clamp(strength, 0, 1) })
        : null;
    })
    .filter((sample) => sample && time - sample.occurredAt <= lifetime)
    .slice(-MAX_SAMPLES);

  const eligible = classifyFrame(frame);
  if (!eligible) return Object.freeze({ wakeClass: null, samples: Object.freeze([]) });

  const matching = retained.filter((sample) => sample.wakeClass === eligible.wakeClass);
  const last = matching[matching.length - 1] ?? null;
  if (!last || distance(last, eligible.position) >= MIN_SAMPLE_DISTANCE) {
    matching.push(Object.freeze({
      ...eligible.position,
      surfaceHeight: eligible.surfaceHeight,
      occurredAt: time,
      wakeClass: eligible.wakeClass,
      strength: eligible.strength,
    }));
  }

  return Object.freeze({
    wakeClass: eligible.wakeClass,
    samples: Object.freeze(matching.slice(reducedMotion === true ? -2 : -MAX_SAMPLES)),
  });
}

export function lowFlightWakePresentation(state, { highContrast = false } = {}) {
  const wakeClass = WAKE_CLASSES.includes(state?.wakeClass) ? state.wakeClass : null;
  const samples = Array.isArray(state?.samples) ? state.samples : [];
  return Object.freeze({
    active: Boolean(wakeClass && samples.length),
    wakeClass,
    opacity: wakeClass ? Math.min(0.44, (wakeClass === 'water' ? 0.22 : 0.14) * (highContrast === true ? 1.35 : 1)) : 0,
    depthTest: true,
    depthWrite: false,
    fog: true,
  });
}

export function lowFlightWakePublicState(state) {
  const wakeClass = WAKE_CLASSES.includes(state?.wakeClass) && Array.isArray(state?.samples) && state.samples.length ? state.wakeClass : null;
  return Object.freeze({ active: Boolean(wakeClass), wakeClass });
}
