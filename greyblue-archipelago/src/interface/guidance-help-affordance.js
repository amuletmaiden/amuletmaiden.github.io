const DEFAULT_SHORTCUT = 'G';
const MAX_HELP_TEXT = 320;

export function createGuidanceHelpAffordance(options = {}) {
  const shortcut = normalizeShortcut(options.shortcut);
  const publish = typeof options.publish === 'function' ? options.publish : null;
  let open = Boolean(options.open);
  let disposed = false;
  let focusedControl = null;
  let changeCount = 0;
  let lastAnnouncement = null;

  function dispatch(action = {}) {
    if (disposed) return snapshot('disposed', false);

    const type = text(action.type, 40);
    if (type === 'toggle-help') return setOpen(!open, 'toggle');
    if (type === 'open-help') return setOpen(true, 'open');
    if (type === 'close-help' || type === 'escape') return setOpen(false, type);
    if (type === 'shortcut') {
      return normalizeShortcut(action.key) === shortcut
        ? setOpen(!open, 'shortcut')
        : snapshot('ignored-shortcut', false);
    }
    if (type === 'focus') {
      const next = text(action.controlId, 80);
      if (!next || next === focusedControl) return snapshot(next ? 'unchanged-focus' : 'invalid-focus', false);
      focusedControl = next;
      changeCount += 1;
      return emit('focused', true, null);
    }
    if (type === 'blur') {
      if (!focusedControl) return snapshot('unchanged-focus', false);
      focusedControl = null;
      changeCount += 1;
      return emit('blurred', true, null);
    }
    return snapshot('unsupported-action', false);
  }

  function setOpen(next, reason) {
    const normalized = Boolean(next);
    if (normalized === open) return snapshot('unchanged', false);
    open = normalized;
    changeCount += 1;
    const announcement = bounded(open ? 'Guidance help opened.' : 'Guidance help closed.');
    return emit(reason, true, announcement);
  }

  function emit(reason, changed, announcement) {
    if (announcement && announcement !== lastAnnouncement) {
      lastAnnouncement = announcement;
      safelyPublish(publish, freeze({ type: 'announcement', text: announcement }));
    }
    return snapshot(reason, changed);
  }

  function dispose() {
    if (disposed) return snapshot('disposed', false);
    disposed = true;
    open = false;
    focusedControl = null;
    changeCount += 1;
    return snapshot('disposed', true);
  }

  function snapshot(reason, changed) {
    const helpText = bounded(`Press ${shortcut} to toggle guidance help. Use the guidance controls to choose off, minimal, or standard detail. Reduced motion preserves equivalent guidance without animated emphasis. Sound cues remain optional.`);
    return freeze({
      reason,
      changed: Boolean(changed),
      open,
      disposed,
      shortcut,
      focusedControl,
      trigger: freeze({
        label: 'Guidance help',
        expanded: open,
        controls: 'greyblue-guidance-help',
        shortcut,
      }),
      panel: freeze({
        id: 'greyblue-guidance-help',
        hidden: !open,
        role: 'region',
        label: 'Guidance help',
        text: helpText,
      }),
      announcement: lastAnnouncement,
      telemetry: freeze({ changeCount }),
    });
  }

  return freeze({
    dispatch,
    inspect: () => snapshot('inspect', false),
    dispose,
  });
}

function normalizeShortcut(value) {
  const normalized = text(value, 8);
  return normalized ? normalized.toUpperCase() : DEFAULT_SHORTCUT;
}

function bounded(value) {
  return text(value, MAX_HELP_TEXT) ?? '';
}

function text(value, max) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function safelyPublish(publish, payload) {
  if (!publish) return;
  try {
    publish(payload);
  } catch {
    // Accessibility feedback must never interrupt play.
  }
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
