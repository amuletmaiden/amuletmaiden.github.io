const VALID_DENSITIES = new Set(['focused', 'expanded']);

export function deriveFlightIntentionStrongSurface({
  errorText = '',
  safety = false,
  landing = false,
  landmark = false,
  crossing = false,
  guidance = false,
  approach = false,
} = {}) {
  return Boolean(
    String(errorText).trim()
    || safety === true
    || landing === true
    || landmark === true
    || crossing === true
    || guidance === true
    || approach === true
  );
}

export function resolveFlightIntentionDensity(rootDensity, hudDensity) {
  if (VALID_DENSITIES.has(rootDensity)) return rootDensity;
  if (VALID_DENSITIES.has(hudDensity)) return hudDensity;
  return 'focused';
}

export function flightIntentionPresentation({ density = 'focused', reducedMotion = false, highContrast = false } = {}) {
  const normalizedDensity = VALID_DENSITIES.has(density) ? density : 'focused';
  return Object.freeze({
    density: normalizedDensity,
    motion: reducedMotion ? 'reduced' : 'standard',
    contrast: highContrast ? 'high' : 'standard',
  });
}

export function nextFlightIntentionAnnouncement({ visible, kind, phase, text } = {}, lastKey = '') {
  if (visible !== true) return Object.freeze({ key: '', text: '', changed: lastKey !== '' });
  const safeKind = typeof kind === 'string' ? kind : '';
  const safePhase = typeof phase === 'string' ? phase : '';
  const key = safeKind && safePhase ? `${safeKind}|${safePhase}` : '';
  if (!key || key === lastKey) return Object.freeze({ key: lastKey, text: '', changed: false });
  return Object.freeze({
    key,
    text: typeof text === 'string' ? text : '',
    changed: true,
  });
}
