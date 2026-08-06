const DEFAULT_IDS = Object.freeze({
  trigger: 'greyblue-guidance-help-trigger',
  panel: 'greyblue-guidance-help',
  status: 'greyblue-guidance-help-status',
});

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeCall(fn, ...args) {
  try {
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch {
    return undefined;
  }
}

function setAttribute(node, name, value) {
  safeCall(node?.setAttribute?.bind(node), name, String(value));
}

function normalizeState(input = {}) {
  const trigger = input.trigger && typeof input.trigger === 'object' ? input.trigger : {};
  const panel = input.panel && typeof input.panel === 'object' ? input.panel : {};
  return Object.freeze({
    open: Boolean(input.open),
    disposed: Boolean(input.disposed),
    shortcut: safeText(input.shortcut, 'G').slice(0, 8),
    focusedControl: safeText(input.focusedControl) || null,
    trigger: Object.freeze({
      label: safeText(trigger.label, 'Guidance help').slice(0, 80),
      expanded: Boolean(trigger.expanded ?? input.open),
      controls: safeText(trigger.controls, DEFAULT_IDS.panel).slice(0, 80),
    }),
    panel: Object.freeze({
      id: safeText(panel.id, DEFAULT_IDS.panel).slice(0, 80),
      hidden: Boolean(panel.hidden ?? !input.open),
      role: safeText(panel.role, 'region').slice(0, 40),
      label: safeText(panel.label, 'Guidance help').slice(0, 80),
      text: safeText(panel.text, 'Guidance help is unavailable.').slice(0, 320),
    }),
    announcement: safeText(input.announcement).slice(0, 160) || null,
  });
}

function listen(node, type, handler) {
  if (!node || typeof handler !== 'function') return () => undefined;
  if (typeof node.addEventListener === 'function') {
    safeCall(node.addEventListener.bind(node), type, handler);
    return () => safeCall(node.removeEventListener?.bind(node), type, handler);
  }
  const property = `on${type}`;
  node[property] = handler;
  return () => {
    if (node[property] === handler) node[property] = null;
  };
}

export function createGuidanceHelpDomBinding(options = {}) {
  const documentLike = options.documentLike ?? globalThis.document;
  const dispatch = typeof options.dispatch === 'function' ? options.dispatch : () => undefined;
  const ids = Object.freeze({
    trigger: safeText(options.ids?.trigger, DEFAULT_IDS.trigger),
    panel: safeText(options.ids?.panel, DEFAULT_IDS.panel),
    status: safeText(options.ids?.status, DEFAULT_IDS.status),
  });

  const trigger = safeCall(documentLike?.getElementById?.bind(documentLike), ids.trigger);
  const panel = safeCall(documentLike?.getElementById?.bind(documentLike), ids.panel);
  const status = safeCall(documentLike?.getElementById?.bind(documentLike), ids.status);
  const cleanups = [];
  const telemetry = {
    renderCount: 0,
    dispatchCount: 0,
    announcementCount: 0,
    duplicateRenders: 0,
    ignoredKeys: 0,
  };
  let lastSignature = null;
  let lastAnnouncement = null;
  let disposed = false;

  if (trigger) {
    trigger.type = 'button';
    cleanups.push(listen(trigger, 'click', () => route({ type: 'toggle-help' })));
    cleanups.push(listen(trigger, 'focus', () => route({ type: 'focus', controlId: ids.trigger })));
    cleanups.push(listen(trigger, 'blur', () => route({ type: 'blur' })));
  }

  cleanups.push(listen(documentLike, 'keydown', (event = {}) => {
    const key = safeText(event.key).toUpperCase();
    if (key === 'ESCAPE') {
      safeCall(event.preventDefault?.bind(event));
      route({ type: 'escape' });
      return;
    }
    const state = inspectState();
    if (key && key === state.shortcut.toUpperCase() && !event.altKey && !event.ctrlKey && !event.metaKey) {
      safeCall(event.preventDefault?.bind(event));
      route({ type: 'shortcut', key });
      return;
    }
    telemetry.ignoredKeys += 1;
  }));

  if (status) {
    setAttribute(status, 'role', 'status');
    setAttribute(status, 'aria-live', 'polite');
    setAttribute(status, 'aria-atomic', 'true');
  }

  function route(action) {
    if (disposed) return snapshot({ routed: false, reason: 'disposed' });
    telemetry.dispatchCount += 1;
    const result = safeCall(dispatch, Object.freeze({ ...action }));
    if (result && typeof result === 'object') render(result);
    return snapshot({ routed: true, action: action.type });
  }

  function render(input = {}) {
    if (disposed) return snapshot({ changed: false, reason: 'disposed' });
    const state = normalizeState(input);
    inspectState.current = state;
    const signature = JSON.stringify(state);
    if (signature === lastSignature) {
      telemetry.duplicateRenders += 1;
      return snapshot({ changed: false });
    }

    if (trigger) {
      trigger.textContent = state.trigger.label;
      trigger.disabled = state.disposed;
      setAttribute(trigger, 'id', ids.trigger);
      setAttribute(trigger, 'aria-controls', state.trigger.controls);
      setAttribute(trigger, 'aria-expanded', state.trigger.expanded ? 'true' : 'false');
      setAttribute(trigger, 'aria-keyshortcuts', state.shortcut);
    }

    if (panel) {
      panel.textContent = state.panel.text;
      panel.hidden = state.panel.hidden;
      setAttribute(panel, 'id', state.panel.id);
      setAttribute(panel, 'role', state.panel.role);
      setAttribute(panel, 'aria-label', state.panel.label);
      setAttribute(panel, 'tabindex', '-1');
    }

    if (state.announcement && state.announcement !== lastAnnouncement && status) {
      status.textContent = state.announcement;
      lastAnnouncement = state.announcement;
      telemetry.announcementCount += 1;
    }

    lastSignature = signature;
    telemetry.renderCount += 1;
    return snapshot({ changed: true });
  }

  function inspectState() {
    return inspectState.current ?? normalizeState({});
  }

  function dispose() {
    if (disposed) return snapshot({ disposed: true, changed: false });
    disposed = true;
    for (const cleanup of cleanups.splice(0)) safeCall(cleanup);
    if (trigger) trigger.disabled = true;
    if (panel) panel.hidden = true;
    return snapshot({ disposed: true, changed: true });
  }

  function snapshot(extra = {}) {
    return Object.freeze({
      ...extra,
      ready: Boolean(trigger || panel || status),
      disposed,
      ids,
      telemetry: Object.freeze({ ...telemetry }),
    });
  }

  return Object.freeze({ render, route, inspect: snapshot, dispose });
}
