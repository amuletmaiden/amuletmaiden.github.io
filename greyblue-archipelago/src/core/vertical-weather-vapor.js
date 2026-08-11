const VAPOR_LAYERS = new Set(['low', 'mist', 'break']);
const MAX_HISTORY = 6;
const MAX_AGE_MS = 900;
const MIN_SPACING = 14;
const MIN_SPEED = 34;

function finitePoint(value) {
  return value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z)
    ? Object.freeze({ x: value.x, y: value.y, z: value.z })
    : null;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function emptyState() {
  return Object.freeze({ active: false, vaporClass: null, history: Object.freeze([]) });
}

export function createVerticalWeatherVaporState() {
  return emptyState();
}

function validFrame(frame) {
  return frame?.ready === true
    && frame?.paused !== true
    && frame?.airborne === true
    && frame?.recoveryActive !== true
    && frame?.restorePublishing !== true
    && Number.isFinite(frame?.speed)
    && Number.isFinite(frame?.now)
    && finitePoint(frame?.position)
    && frame?.weather?.active === true
    && typeof frame.weather.layer === 'string';
}

function presentationFor(layer) {
  switch (layer) {
    case 'low': return Object.freeze({ opacity: 0.2, scale: 1.16, lifetimeMs: 900 });
    case 'break': return Object.freeze({ opacity: 0.17, scale: 0.82, lifetimeMs: 560 });
    default: return Object.freeze({ opacity: 0.13, scale: 1, lifetimeMs: 760 });
  }
}

export function stepVerticalWeatherVapor({
  state = createVerticalWeatherVaporState(),
  frame = {},
  reducedMotion = false,
} = {}) {
  if (!validFrame(frame) || frame.speed < MIN_SPEED || !VAPOR_LAYERS.has(frame.weather.layer)) {
    return emptyState();
  }

  const position = finitePoint(frame.position);
  const now = frame.now;
  const vaporClass = frame.weather.layer;
  const prior = Array.isArray(state?.history) && state?.vaporClass === vaporClass
    ? state.history
    : [];
  const live = prior.filter((sample) => Number.isFinite(sample?.at)
    && now >= sample.at
    && now - sample.at <= MAX_AGE_MS
    && finitePoint(sample?.position));
  const last = live.at(-1) ?? null;
  const shouldSample = !last || distance(last.position, position) >= MIN_SPACING;
  const next = shouldSample
    ? [...live, Object.freeze({ position, at: now })]
    : live;
  const cap = reducedMotion === true ? 1 : MAX_HISTORY;
  const history = Object.freeze(next.slice(-cap));

  return Object.freeze({ active: true, vaporClass, history });
}

export function verticalWeatherVaporPublicState(state = null) {
  return Object.freeze({
    active: state?.active === true && VAPOR_LAYERS.has(state?.vaporClass),
    vaporClass: state?.active === true && VAPOR_LAYERS.has(state?.vaporClass) ? state.vaporClass : null,
  });
}

export function verticalWeatherVaporPresentation(state = null, { highContrast = false } = {}) {
  if (state?.active !== true || !VAPOR_LAYERS.has(state?.vaporClass)) {
    return Object.freeze({ active: false, vaporClass: null, opacity: 0, scale: 1, lifetimeMs: 0, history: Object.freeze([]) });
  }
  const base = presentationFor(state.vaporClass);
  const history = Array.isArray(state.history)
    ? state.history.slice(-MAX_HISTORY).map((sample) => Object.freeze({
        position: finitePoint(sample?.position),
        at: Number(sample?.at),
      })).filter((sample) => sample.position && Number.isFinite(sample.at))
    : [];
  return Object.freeze({
    active: true,
    vaporClass: state.vaporClass,
    opacity: Math.min(0.28, base.opacity * (highContrast === true ? 1.24 : 1)),
    scale: base.scale,
    lifetimeMs: base.lifetimeMs,
    history: Object.freeze(history),
  });
}
