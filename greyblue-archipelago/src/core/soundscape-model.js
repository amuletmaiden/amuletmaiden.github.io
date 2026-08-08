const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boundedText(value, maximum = 96) {
  return String(value ?? '').trim().slice(0, maximum);
}

function regionTone(regionId) {
  const id = boundedText(regionId, 64);
  if (!id) return 82.41;
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const semitone = Math.abs(hash >>> 0) % 12;
  return 82.41 * Math.pow(2, semitone / 12);
}

export function deriveSoundscape(state = {}) {
  const ready = state?.ready === true;
  const paused = state?.paused === true;
  const speed = clamp(finite(state?.flight?.speed), 0, 220);
  const altitude = clamp(finite(state?.position?.y), 0, 3200);
  const fogDensity = clamp(finite(state?.fog?.effectiveDensity, state?.fog?.density), 0, 0.0012);
  const speedPressure = clamp(speed / 120, 0, 1);
  const altitudePressure = clamp(altitude / 1800, 0, 1);
  const fogPressure = clamp(fogDensity / 0.0005, 0, 1);
  const crossing = state?.routeChoice?.reason === 'active-crossing';
  const regionId = boundedText(state?.currentRegion?.id, 64);

  if (!ready || paused) {
    return Object.freeze({
      active: false,
      windGain: 0,
      windCutoff: 320,
      toneGain: 0,
      toneFrequency: regionTone(regionId),
      crossingGain: 0,
      crossingRate: 0,
      regionId,
      crossing,
    });
  }

  const windGain = clamp(0.018 + speedPressure * 0.105 + altitudePressure * 0.018, 0, 0.15);
  const windCutoff = clamp(520 + speedPressure * 1450 + altitudePressure * 360 - fogPressure * 520, 320, 2400);
  const toneGain = clamp(0.008 + (1 - fogPressure) * 0.009 + altitudePressure * 0.004, 0.006, 0.024);
  const crossingGain = crossing ? clamp(0.024 + speedPressure * 0.022 + fogPressure * 0.01, 0.024, 0.058) : 0;
  const crossingRate = crossing ? clamp(0.32 + speedPressure * 0.36, 0.32, 0.68) : 0;

  return Object.freeze({
    active: true,
    windGain,
    windCutoff,
    toneGain,
    toneFrequency: regionTone(regionId),
    crossingGain,
    crossingRate,
    regionId,
    crossing,
  });
}
