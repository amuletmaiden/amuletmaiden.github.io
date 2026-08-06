const DEFAULT_IDS = Object.freeze({
  panel: 'greyblue-guidance-settings',
  status: 'greyblue-guidance-status',
});

const MODE_VALUES = new Set(['off', 'minimal', 'standard']);

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function safeCall(fn, ...args) {
  try {
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSettings(settings = {}) {
  const mode = MODE_VALUES.has(settings.mode) ? settings.mode : 'standard';
  return Object.freeze({
    mode,
    reducedMotion: Boolean(settings.reducedMotion),
    soundEnabled: Boolean(settings.soundEnabled),
  });
}

function normalizeSurface(surface = {}) {
  const controls = Array.isArray(surface.controls) ? surface.controls : [];
  return Object.freeze({
    title: safeText(surface.title, 'Guidance'),
    layout: surface.layout === 'stacked' ? 'stacked' : 'inline',
    controls: Object.freeze(controls.slice(0, 8).map((control, index) => Object.freeze({
      id: safeText(control?.id, `control-${index}`),
      label: safeText(control?.label, `Control ${index + 1}`),
      kind: control?.kind === 'toggle' ? 'toggle' : 'choice',
      value: control?.value,
      selected: Boolean(control?.selected),
      disabled: Boolean(control?.disabled),
      action: control?.action && typeof control.action === 'object'
        ? Object.freeze({ ...control.action })
        : null,
    }))),
  });
}

function setAttribute(node, name, value) {
  safeCall(node?.setAttribute?.bind(node), name, String(value));
}

function replaceChildren(node, children) {
  if (!node) return false;
  if (typeof node.replaceChildren === 'function') {
    safeCall(node.replaceChildren.bind(node), ...children);
    return true;
  }
  if (Array.isArray(node.children)) {
    node.children.length = 0;
    node.children.push(...children);
    return true;
  }
  return false;
}

function createControl(documentLike, control, dispatch) {
  const button = safeCall(documentLike?.createElement?.bind(documentLike), 'button');
  if (!button) return null;

  button.type = 'button';
  button.textContent = control.label;
  button.disabled = control.disabled;
  setAttribute(button, 'data-guidance-control', control.id);
  setAttribute(button, 'aria-pressed', control.selected ? 'true' : 'false');
  setAttribute(button, 'aria-disabled', control.disabled ? 'true' : 'false');

  if (!control.disabled && control.action) {
    const handler = () => safeCall(dispatch, control.action);
    if (typeof button.addEventListener === 'function') {
      safeCall(button.addEventListener.bind(button), 'click', handler);
    } else {
      button.onclick = handler;
    }
  }

  return button;
}

export function createGuidanceDomBinding(options = {}) {
  const documentLike = options.documentLike ?? globalThis.document;
  const ids = Object.freeze({
    panel: safeText(options.ids?.panel, DEFAULT_IDS.panel),
    status: safeText(options.ids?.status, DEFAULT_IDS.status),
  });
  const dispatch = typeof options.dispatch === 'function' ? options.dispatch : () => undefined;
  const panel = safeCall(documentLike?.getElementById?.bind(documentLike), ids.panel);
  const status = safeCall(documentLike?.getElementById?.bind(documentLike), ids.status);

  const state = {
    renderCount: 0,
    announcementCount: 0,
    duplicateAnnouncements: 0,
    missingPanel: !panel,
    missingStatus: !status,
    lastAnnouncementId: null,
    lastSignature: null,
  };

  if (status) {
    setAttribute(status, 'role', 'status');
    setAttribute(status, 'aria-live', 'polite');
    setAttribute(status, 'aria-atomic', 'true');
  }

  function render(surfaceInput = {}, settingsInput = {}) {
    const surface = normalizeSurface(surfaceInput);
    const settings = normalizeSettings(settingsInput);
    const signature = JSON.stringify({ surface, settings });
    const changed = signature !== state.lastSignature;

    if (panel && changed) {
      const heading = safeCall(documentLike?.createElement?.bind(documentLike), 'h2');
      if (heading) heading.textContent = surface.title;
      const controls = surface.controls
        .map((control) => createControl(documentLike, control, dispatch))
        .filter(Boolean);
      replaceChildren(panel, heading ? [heading, ...controls] : controls);
      setAttribute(panel, 'data-layout', surface.layout);
      setAttribute(panel, 'data-guidance-mode', settings.mode);
      setAttribute(panel, 'data-reduced-motion', settings.reducedMotion);
      setAttribute(panel, 'data-sound-enabled', settings.soundEnabled);
      state.renderCount += 1;
      state.lastSignature = signature;
    }

    return snapshot({ changed });
  }

  function announce(announcement = {}) {
    const id = safeText(announcement.id);
    const text = safeText(announcement.text);
    const permitted = announcement.permitted !== false;
    if (!status || !permitted || !id || !text) return snapshot({ announced: false });
    if (id === state.lastAnnouncementId) {
      state.duplicateAnnouncements += 1;
      return snapshot({ announced: false });
    }

    status.textContent = text.slice(0, 240);
    state.lastAnnouncementId = id;
    state.announcementCount += 1;
    return snapshot({ announced: true });
  }

  function snapshot(extra = {}) {
    return Object.freeze({
      ...extra,
      ready: Boolean(panel || status),
      ids,
      telemetry: Object.freeze({
        renderCount: finiteNumber(state.renderCount),
        announcementCount: finiteNumber(state.announcementCount),
        duplicateAnnouncements: finiteNumber(state.duplicateAnnouncements),
        missingPanel: state.missingPanel,
        missingStatus: state.missingStatus,
      }),
    });
  }

  return Object.freeze({ render, announce, snapshot });
}
