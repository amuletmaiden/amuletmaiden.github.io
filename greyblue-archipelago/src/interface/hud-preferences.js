const DENSITIES = new Set(['focused', 'expanded']);
const INPUT_SOURCES = new Set(['keyboard', 'gamepad']);

export function normalizeHudDensity(value) {
  return DENSITIES.has(value) ? value : 'focused';
}

export function toggleHudDensity(value) {
  return normalizeHudDensity(value) === 'focused' ? 'expanded' : 'focused';
}

export function normalizeHudInputSource(value) {
  return INPUT_SOURCES.has(value) ? value : 'keyboard';
}

export function deriveHudPreferenceState({ settings, inputSource } = {}) {
  const density = normalizeHudDensity(settings?.hudDensity);
  const source = normalizeHudInputSource(inputSource);
  return Object.freeze({
    density,
    inputSource: source,
    telemetry: Object.freeze({ density, inputSource: source }),
  });
}

export function controlHintForSource(inputSource) {
  return normalizeHudInputSource(inputSource) === 'gamepad'
    ? 'Controls: use your flight controls; HUD density is available from the interface toggle.'
    : 'Controls: use your flight controls; press H to change HUD density.';
}
