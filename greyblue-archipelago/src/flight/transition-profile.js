const DEFAULTS = Object.freeze({
  takeoffEnterSpeed: 7,
  takeoffExitSpeed: 13,
  glideEnterThrottle: 0.18,
  glideExitThrottle: 0.34,
  glideEnterSpeed: 14,
  flareEnterHeight: 7,
  flareExitHeight: 11,
  touchdownSpeed: 8,
  stallEnter: 0.62,
  stallExit: 0.28,
  transitionHoldSeconds: 0.18,
});

export function createFlightTransitionState(initial = {}) {
  return Object.freeze({
    mode: normalizeMode(initial.mode),
    candidate: normalizeMode(initial.candidate),
    candidateAge: finiteClamp(initial.candidateAge, 0, 10, 0),
  });
}

export function stepFlightTransition(state, sample, dt, config = {}) {
  const previous = createFlightTransitionState(state);
  const settings = normalizeConfig(config);
  const frame = finiteClamp(dt, 0, 0.05, 0);
  const airborne = sample?.airborne !== false;
  const landingRequested = Boolean(sample?.landingRequested);
  const height = Math.max(0, finiteNumber(sample?.heightAboveSurface, 0));
  const airspeed = Math.max(0, finiteNumber(sample?.airspeed, 0));
  const throttle = finiteClamp(sample?.throttle, -1, 1, 0);
  const verticalSpeed = finiteClamp(sample?.verticalSpeed, -100, 100, 0);
  const stallPressure = finiteClamp(sample?.stallPressure, 0, 1, 0);

  const desired = chooseMode(previous.mode, {
    airborne,
    landingRequested,
    height,
    airspeed,
    throttle,
    verticalSpeed,
    stallPressure,
  }, settings);

  const candidateAge = desired === previous.candidate
    ? previous.candidateAge + frame
    : frame;
  const immediate = desired === "grounded" || desired === "recovery" || previous.mode === "grounded";
  const accepted = desired === previous.mode
    || immediate
    || candidateAge >= settings.transitionHoldSeconds;
  const mode = accepted ? desired : previous.mode;

  const profile = profileFor(mode, { airspeed, height, verticalSpeed, stallPressure });
  return Object.freeze({
    state: Object.freeze({
      mode,
      candidate: desired,
      candidateAge: desired === mode ? 0 : candidateAge,
    }),
    profile: Object.freeze(profile),
    telemetry: Object.freeze({
      mode,
      candidate: desired,
      transitionPending: desired !== mode,
      landingRequested,
      recoveryEngaged: mode === "recovery",
      malformedFallback: !isFiniteSample(sample),
    }),
  });
}

function chooseMode(previousMode, sample, settings) {
  if (!sample.airborne) return "grounded";
  if (sample.stallPressure >= settings.stallEnter
    || (previousMode === "recovery" && sample.stallPressure > settings.stallExit)) return "recovery";
  if (sample.landingRequested
    && (sample.height <= settings.flareEnterHeight || previousMode === "flare" && sample.height < settings.flareExitHeight)) {
    return sample.airspeed <= settings.touchdownSpeed && sample.height <= 1.2 ? "touchdown" : "flare";
  }
  if (previousMode === "takeoff" && sample.airspeed < settings.takeoffExitSpeed) return "takeoff";
  if (sample.height < 2.5 && sample.airspeed < settings.takeoffEnterSpeed) return "takeoff";
  const glideEligible = sample.airspeed >= settings.glideEnterSpeed
    && sample.throttle <= (previousMode === "glide" ? settings.glideExitThrottle : settings.glideEnterThrottle)
    && !sample.landingRequested;
  return glideEligible ? "glide" : "powered";
}

function profileFor(mode, sample) {
  switch (mode) {
    case "grounded": return { liftScale: 0, dragScale: 1.25, pitchAssist: 0, throttleFloor: 0 };
    case "takeoff": return { liftScale: 1.18, dragScale: 0.92, pitchAssist: 0.24, throttleFloor: 0.48 };
    case "glide": return { liftScale: 1.08, dragScale: 0.72, pitchAssist: clamp(-sample.verticalSpeed / 35, -0.12, 0.16), throttleFloor: 0 };
    case "flare": return { liftScale: 1.24, dragScale: 1.16, pitchAssist: 0.2, throttleFloor: 0 };
    case "touchdown": return { liftScale: 0.35, dragScale: 1.48, pitchAssist: 0.08, throttleFloor: 0 };
    case "recovery": return { liftScale: 1.12, dragScale: 0.9, pitchAssist: clamp(0.32 + sample.stallPressure * 0.12, 0.32, 0.44), throttleFloor: 0.42 };
    default: return { liftScale: 1, dragScale: 1, pitchAssist: 0, throttleFloor: 0 };
  }
}

function normalizeConfig(config) {
  return {
    takeoffEnterSpeed: positive(config.takeoffEnterSpeed, DEFAULTS.takeoffEnterSpeed),
    takeoffExitSpeed: positive(config.takeoffExitSpeed, DEFAULTS.takeoffExitSpeed),
    glideEnterThrottle: finiteClamp(config.glideEnterThrottle, -1, 1, DEFAULTS.glideEnterThrottle),
    glideExitThrottle: finiteClamp(config.glideExitThrottle, -1, 1, DEFAULTS.glideExitThrottle),
    glideEnterSpeed: positive(config.glideEnterSpeed, DEFAULTS.glideEnterSpeed),
    flareEnterHeight: positive(config.flareEnterHeight, DEFAULTS.flareEnterHeight),
    flareExitHeight: positive(config.flareExitHeight, DEFAULTS.flareExitHeight),
    touchdownSpeed: positive(config.touchdownSpeed, DEFAULTS.touchdownSpeed),
    stallEnter: finiteClamp(config.stallEnter, 0, 1, DEFAULTS.stallEnter),
    stallExit: finiteClamp(config.stallExit, 0, 1, DEFAULTS.stallExit),
    transitionHoldSeconds: finiteClamp(config.transitionHoldSeconds, 0, 2, DEFAULTS.transitionHoldSeconds),
  };
}

function normalizeMode(value) {
  return ["grounded", "takeoff", "powered", "glide", "flare", "touchdown", "recovery"].includes(value)
    ? value
    : "grounded";
}

function isFiniteSample(sample) {
  if (!sample || typeof sample !== "object") return false;
  return ["heightAboveSurface", "airspeed", "throttle", "verticalSpeed", "stallPressure"]
    .every((key) => sample[key] === undefined || Number.isFinite(Number(sample[key])));
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteClamp(value, min, max, fallback) {
  return clamp(finiteNumber(value, fallback), min, max);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
