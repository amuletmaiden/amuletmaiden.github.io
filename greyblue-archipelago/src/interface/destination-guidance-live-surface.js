import { presentDestinationGuidance } from './destination-guidance-presentation.js';

const DEFAULT_SELECTORS = Object.freeze({
  root: '[data-greyblue-guidance]',
  label: '[data-greyblue-guidance-label]',
  status: '[data-greyblue-guidance-status]',
  live: '[data-greyblue-guidance-live]',
});

export function createDestinationGuidanceLiveSurface(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document ?? null;
  const selectors = normalizeSelectors(options.selectors);
  const nodes = resolveNodes(documentRef, selectors);
  const dispatchSound = typeof options.dispatchSound === 'function' ? options.dispatchSound : null;
  let previousPresentation = null;
  let disposed = false;
  let renderCount = 0;
  let suppressedCount = 0;
  let recoveryCount = nodes.recovered ? 1 : 0;

  function update(input = {}) {
    if (disposed) return snapshot('disposed', null, false);

    const presentation = presentDestinationGuidance({
      guidance: input.guidance,
      mountState: input.mountState,
      headingDegrees: input.headingDegrees,
      viewportWidth: input.viewportWidth,
      previousPresentation: previousPresentation?.state,
    });

    const changed = !previousPresentation || presentation.telemetry.changed;
    if (changed) {
      renderPresentation(nodes, presentation);
      renderCount += 1;
    } else {
      suppressedCount += 1;
    }

    if (presentation.announcement) publishAnnouncement(nodes.live, presentation.announcement.text);
    if (presentation.soundHookId && dispatchSound) safelyDispatchSound(dispatchSound, presentation.soundHookId);

    previousPresentation = presentation;
    return snapshot(changed ? 'rendered' : 'unchanged', presentation, changed);
  }

  function clear() {
    if (disposed) return snapshot('disposed', previousPresentation, false);
    clearNodes(nodes);
    previousPresentation = null;
    renderCount += 1;
    return snapshot('cleared', null, true);
  }

  function dispose() {
    if (!disposed) clearNodes(nodes);
    disposed = true;
    previousPresentation = null;
    return snapshot('disposed', null, true);
  }

  function snapshot(reason, presentation, changed) {
    return freeze({
      reason,
      changed,
      disposed,
      presentation,
      telemetry: freeze({
        renderCount,
        suppressedCount,
        recoveryCount,
        completeDom: nodes.complete,
      }),
    });
  }

  return freeze({ update, clear, dispose, inspect: () => snapshot('inspect', previousPresentation, false) });
}

function normalizeSelectors(value) {
  const source = value && typeof value === 'object' ? value : {};
  return freeze({
    root: text(source.root) ?? DEFAULT_SELECTORS.root,
    label: text(source.label) ?? DEFAULT_SELECTORS.label,
    status: text(source.status) ?? DEFAULT_SELECTORS.status,
    live: text(source.live) ?? DEFAULT_SELECTORS.live,
  });
}

function resolveNodes(documentRef, selectors) {
  if (!documentRef || typeof documentRef.querySelector !== 'function') {
    return freeze({ root: null, label: null, status: null, live: null, complete: false, recovered: true });
  }
  const root = safeQuery(documentRef, selectors.root);
  const scope = root && typeof root.querySelector === 'function' ? root : documentRef;
  const label = safeQuery(scope, selectors.label);
  const status = safeQuery(scope, selectors.status);
  const live = safeQuery(scope, selectors.live);
  return freeze({ root, label, status, live, complete: Boolean(root && label && status && live), recovered: !(root && label && status && live) });
}

function renderPresentation(nodes, presentation) {
  setHidden(nodes.root, !presentation.visible);
  setText(nodes.label, presentation.label ?? '');
  setText(nodes.status, presentation.keyboardText ?? '');
  setAttribute(nodes.root, 'data-guidance-state', presentation.destination?.phase ?? 'none');
  setAttribute(nodes.root, 'data-guidance-motion', presentation.motion ?? 'none');
}

function publishAnnouncement(node, textValue) {
  if (!node) return;
  setAttribute(node, 'role', 'status');
  setAttribute(node, 'aria-live', 'polite');
  setAttribute(node, 'aria-atomic', 'true');
  setText(node, textValue);
}

function clearNodes(nodes) {
  setHidden(nodes.root, true);
  setText(nodes.label, '');
  setText(nodes.status, '');
  setText(nodes.live, '');
  setAttribute(nodes.root, 'data-guidance-state', 'none');
  setAttribute(nodes.root, 'data-guidance-motion', 'none');
}

function safelyDispatchSound(dispatchSound, soundHookId) {
  try {
    dispatchSound(freeze({ id: soundHookId, source: 'destination-guidance' }));
  } catch {
    // Sound is optional and must never break semantic guidance.
  }
}

function safeQuery(scope, selector) {
  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function setText(node, value) {
  if (node && 'textContent' in node) node.textContent = String(value).slice(0, 240);
}

function setHidden(node, hidden) {
  if (!node) return;
  node.hidden = Boolean(hidden);
  setAttribute(node, 'aria-hidden', hidden ? 'true' : 'false');
}

function setAttribute(node, name, value) {
  if (node && typeof node.setAttribute === 'function') node.setAttribute(name, String(value));
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
