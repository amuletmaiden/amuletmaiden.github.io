const LAYERS = new Set(['low', 'mist', 'break', 'clear']);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function neutralState() {
  return Object.freeze({
    active: false,
    layer: 'mist',
    windGainMultiplier: 1,
    windCutoffMultiplier: 1,
    aerodynamicGainMultiplier: 1,
  });
}

export function createVerticalWeatherSoundState() {
  return neutralState();
}

function validFrame(frame) {
  return frame?.ready === true
    && frame?.paused !== true
    && frame?.airborne === true
    && frame?.recoveryActive !== true
    && frame?.restorePublishing !== true
    && Number.isFinite(frame?.altitude)
    && Number.isFinite(frame?.speed)
    && Number.isFinite(frame?.cloudline)
    && frame.cloudline > 120
    && Number.isFinite(frame?.fogDensity)
    && frame.fogDensity >= 0;
}

function nextLayer(previousLayer, frame) {
  const altitude = frame.altitude;
  const cloudline = frame.cloudline;
  const lowBand = Math.max(80, cloudline * 0.4);
  const breakHalfWidth = clamp(cloudline * 0.055, 45, 90);
  const clearEnter = cloudline + breakHalfWidth;
  const clearExit = cloudline + breakHalfWidth * 0.45;
  const breakEnterLow = cloudline - breakHalfWidth;
  const breakExitLow = cloudline - breakHalfWidth * 1.35;
  const lowEnter = lowBand;
  const lowExit = lowBand + Math.max(35, cloudline * 0.035);

  if (previousLayer === 'clear') {
    if (altitude >= clearExit) return 'clear';
    if (altitude >= breakEnterLow) return 'break';
  }
  if (previousLayer === 'low') {
    if (altitude <= lowExit) return 'low';
  }
  if (previousLayer === 'break') {
    if (altitude >= clearEnter) return 'clear';
    if (altitude >= breakExitLow) return 'break';
  }

  if (altitude <= lowEnter) return 'low';
  if (altitude >= clearEnter) return 'clear';
  if (altitude >= breakEnterLow) return 'break';
  return 'mist';
}

function mixForLayer(layer, frame) {
  const speedPressure = clamp(frame.speed / 120, 0, 1);
  const fogPressure = clamp(frame.fogDensity / 0.0005, 0, 1);
  switch (layer) {
    case 'low':
      return {
        windGainMultiplier: clamp(0.86 + speedPressure * 0.05, 0.84, 0.93),
        windCutoffMultiplier: clamp(0.68 + (1 - fogPressure) * 0.08, 0.66, 0.76),
        aerodynamicGainMultiplier: clamp(0.9 + speedPressure * 0.04, 0.9, 0.94),
      };
    case 'break':
      return {
        windGainMultiplier: clamp(1.03 + speedPressure * 0.05, 1.03, 1.08),
        windCutoffMultiplier: clamp(1.12 + (1 - fogPressure) * 0.08, 1.12, 1.2),
        aerodynamicGainMultiplier: clamp(1.04 + speedPressure * 0.05, 1.04, 1.09),
      };
    case 'clear':
      return {
        windGainMultiplier: clamp(1.08 + speedPressure * 0.06, 1.08, 1.14),
        windCutoffMultiplier: clamp(1.22 + (1 - fogPressure) * 0.08, 1.22, 1.3),
        aerodynamicGainMultiplier: clamp(1.08 + speedPressure * 0.06, 1.08, 1.14),
      };
    default:
      return {
        windGainMultiplier: 1,
        windCutoffMultiplier: clamp(0.9 + (1 - fogPressure) * 0.08, 0.9, 0.98),
        aerodynamicGainMultiplier: 1,
      };
  }
}

export function stepVerticalWeatherSound({
  state = createVerticalWeatherSoundState(),
  frame = {},
} = {}) {
  if (!validFrame(frame)) return neutralState();
  const previousLayer = state?.active === true && LAYERS.has(state?.layer) ? state.layer : 'mist';
  const layer = nextLayer(previousLayer, frame);
  const mix = mixForLayer(layer, frame);
  return Object.freeze({ active: true, layer, ...mix });
}

export function verticalWeatherSoundPublicState(state) {
  return Object.freeze({
    active: state?.active === true,
    layer: state?.active === true && LAYERS.has(state?.layer) ? state.layer : 'mist',
  });
}

export function verticalWeatherSoundMix(state) {
  if (state?.active !== true) {
    return Object.freeze({ windGainMultiplier: 1, windCutoffMultiplier: 1, aerodynamicGainMultiplier: 1 });
  }
  return Object.freeze({
    windGainMultiplier: clamp(Number(state.windGainMultiplier) || 1, 0.8, 1.2),
    windCutoffMultiplier: clamp(Number(state.windCutoffMultiplier) || 1, 0.6, 1.35),
    aerodynamicGainMultiplier: clamp(Number(state.aerodynamicGainMultiplier) || 1, 0.85, 1.2),
  });
}
