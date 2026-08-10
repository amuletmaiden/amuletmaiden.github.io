const TURN_CLASSES = Object.freeze(['left', 'right']);
const MAX_SAMPLES = 8;
const SAMPLE_LIFETIME_MS = 720;
const MIN_SPEED = 27;
const MIN_BANK = 0.16;
const MIN_FOG_DENSITY = 0.00072;
const MIN_SAMPLE_DISTANCE = 5.5;

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function cleanTime(value) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function classifyFrame(frame = {}) {
  const position = point(frame.position);
  const speed = finite(frame.speed);
  const bank = finite(frame.bank);
  const fogDensity = finite(frame.fogDensity);
  const yaw = finite(frame.yaw);
  if (!position || speed == null || bank == null || fogDensity == null || yaw == null) return null;
  if (frame.ready !== true || frame.paused === true || frame.grounded === true || frame.recoveryActive === true || frame.restorePublishing === true) return null;
  if (speed < MIN_SPEED || Math.abs(bank) < MIN_BANK || fogDensity < MIN_FOG_DENSITY) return null;

  const turnClass = bank < 0 ? 'left' : 'right';
  const bankStrength = clamp((Math.abs(bank) - MIN_BANK) / 0.48, 0.18, 1);
  const fogStrength = clamp((fogDensity - MIN_FOG_DENSITY) / 0.0007, 0.15, 1);
  return Object.freeze({ position, yaw, bank, turnClass, strength: clamp(bankStrength * 0.62 + fogStrength * 0.38, 0.18, 1) });
}

function normalizeSample(sample) {
  const position = point(sample);
  const occurredAt = cleanTime(sample?.occurredAt);
  const turnClass = TURN_CLASSES.includes(sample?.turnClass) ? sample.turnClass : null;
  const yaw = finite(sample?.yaw);
  const bank = finite(sample?.bank);
  const strength = finite(sample?.strength);
  if (!position || !turnClass || yaw == null || bank == null || strength == null) return null;
  return Object.freeze({ ...position, occurredAt, turnClass, yaw, bank, strength: clamp(strength, 0, 1) });
}

export function createBankMistArcState() {
  return Object.freeze({ turnClass: null, samples: Object.freeze([]) });
}

export function stepBankMistArcs({ state, frame, now = 0, reducedMotion = false } = {}) {
  const time = cleanTime(now);
  const lifetime = reducedMotion === true ? 240 : SAMPLE_LIFETIME_MS;
  const retained = (Array.isArray(state?.samples) ? state.samples : [])
    .map(normalizeSample)
    .filter((sample) => sample && time - sample.occurredAt <= lifetime)
    .slice(-MAX_SAMPLES);
  const eligible = classifyFrame(frame);
  if (!eligible) return Object.freeze({ turnClass: null, samples: Object.freeze([]) });

  const matching = retained.filter((sample) => sample.turnClass === eligible.turnClass);
  const last = matching[matching.length - 1] ?? null;
  if (!last || distance(last, eligible.position) >= MIN_SAMPLE_DISTANCE) {
    matching.push(Object.freeze({
      ...eligible.position,
      occurredAt: time,
      turnClass: eligible.turnClass,
      yaw: eligible.yaw,
      bank: eligible.bank,
      strength: eligible.strength,
    }));
  }

  return Object.freeze({
    turnClass: eligible.turnClass,
    samples: Object.freeze(matching.slice(reducedMotion === true ? -2 : -MAX_SAMPLES)),
  });
}

export function bankMistArcPresentation(state, { highContrast = false } = {}) {
  const turnClass = TURN_CLASSES.includes(state?.turnClass) ? state.turnClass : null;
  const samples = Array.isArray(state?.samples) ? state.samples : [];
  return Object.freeze({
    active: Boolean(turnClass && samples.length),
    turnClass,
    opacity: turnClass ? Math.min(0.42, 0.2 * (highContrast === true ? 1.4 : 1)) : 0,
    depthTest: true,
    depthWrite: false,
    fog: true,
  });
}

export function bankMistArcPublicState(state) {
  const turnClass = TURN_CLASSES.includes(state?.turnClass) && Array.isArray(state?.samples) && state.samples.length ? state.turnClass : null;
  return Object.freeze({ active: Boolean(turnClass), turnClass });
}
