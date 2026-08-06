const MODES = Object.freeze(['off', 'minimal', 'standard']);

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSettings(settings = {}) {
  const mode = MODES.includes(settings.mode) ? settings.mode : 'standard';
  return Object.freeze({
    mode,
    reducedMotion: settings.reducedMotion === true,
    soundEnabled: settings.soundEnabled === true,
  });
}

function control(id, label, value, action, disabled = false) {
  return Object.freeze({ id, label, value, action, disabled: disabled === true });
}

export function createGuidanceSettingsSurface(input = {}) {
  const settings = normalizeSettings(input.settings);
  const isOpen = input.isOpen === true;
  const compact = input.compact === true;
  const viewportWidth = Math.max(0, finiteNumber(input.viewportWidth, 1280));
  const narrow = compact || viewportWidth < 720;

  const modeControls = MODES.map((mode) => control(
    `guidance-mode-${mode}`,
    mode === 'off' ? 'Off' : mode === 'minimal' ? 'Minimal' : 'Standard',
    settings.mode === mode,
    Object.freeze({ type: 'set-mode', mode }),
  ));

  const controls = Object.freeze([
    ...modeControls,
    control(
      'guidance-reduced-motion',
      'Reduce guidance motion',
      settings.reducedMotion,
      Object.freeze({ type: 'toggle-reduced-motion' }),
    ),
    control(
      'guidance-sound',
      'Guidance sound cues',
      settings.soundEnabled,
      Object.freeze({ type: 'toggle-sound' }),
    ),
  ]);

  const summary = settings.mode === 'off'
    ? 'Guidance is off.'
    : settings.mode === 'minimal'
      ? 'Guidance announces arrivals only.'
      : 'Guidance shows direction, distance, and arrivals.';

  return Object.freeze({
    isOpen,
    layout: narrow ? 'stacked' : 'inline',
    title: 'Guidance',
    summary,
    controls,
    closeAction: Object.freeze({ type: 'close-settings' }),
    telemetry: Object.freeze({
      controlCount: controls.length,
      narrow,
      malformedViewportRecovered: !Number.isFinite(input.viewportWidth),
    }),
  });
}

export function routeGuidanceSettingsSurfaceAction(action = {}) {
  if (!action || typeof action !== 'object') return Object.freeze({ type: 'noop' });
  if (action.type === 'set-mode' && MODES.includes(action.mode)) {
    return Object.freeze({ type: 'set-mode', mode: action.mode });
  }
  if (action.type === 'toggle-reduced-motion') return Object.freeze({ type: action.type });
  if (action.type === 'toggle-sound') return Object.freeze({ type: action.type });
  if (action.type === 'close-settings') return Object.freeze({ type: action.type });
  return Object.freeze({ type: 'noop' });
}
