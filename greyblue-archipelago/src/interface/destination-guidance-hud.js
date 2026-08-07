import { createDestinationGuidanceLiveSurface } from './destination-guidance-live-surface.js';

const IDS = Object.freeze({
  root: 'greyblue-destination-guidance',
  label: 'greyblue-destination-guidance-label',
  status: 'greyblue-destination-guidance-status',
  live: 'greyblue-destination-guidance-live',
});

export function createDestinationGuidanceHud(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document ?? null;
  const host = options.host ?? safeQuery(documentRef, options.hostSelector ?? '[data-greyblue-overlay]') ?? documentRef?.body ?? null;
  const mount = ensureHud(documentRef, host);
  const surface = createDestinationGuidanceLiveSurface({
    documentRef,
    selectors: {
      root: `#${IDS.root}`,
      label: `#${IDS.label}`,
      status: `#${IDS.status}`,
      live: `#${IDS.live}`,
    },
    dispatchSound: options.dispatchSound,
  });

  let disposed = false;
  let updateCount = 0;

  function update(input = {}) {
    if (disposed) return snapshot('disposed', null);
    const result = surface.update(input);
    updateCount += 1;
    applyLayout(mount.root, input.viewportWidth);
    return snapshot(result.reason, result);
  }

  function clear() {
    if (disposed) return snapshot('disposed', null);
    return snapshot('cleared', surface.clear());
  }

  function dispose() {
    if (disposed) return snapshot('disposed', null);
    disposed = true;
    const result = surface.dispose();
    if (mount.created && mount.root?.parentNode && typeof mount.root.parentNode.removeChild === 'function') {
      try { mount.root.parentNode.removeChild(mount.root); } catch {}
    }
    return snapshot('disposed', result);
  }

  function snapshot(reason, surfaceState) {
    return freeze({
      reason,
      disposed,
      mounted: Boolean(mount.root),
      created: mount.created,
      updateCount,
      surface: surfaceState,
    });
  }

  return freeze({ update, clear, dispose, inspect: () => snapshot('inspect', surface.inspect()) });
}

function ensureHud(documentRef, host) {
  if (!documentRef || typeof documentRef.createElement !== 'function' || !host || typeof host.appendChild !== 'function') {
    return freeze({ root: null, created: false, recovered: true });
  }

  const existing = safeQuery(documentRef, `#${IDS.root}`);
  if (existing) return freeze({ root: existing, created: false, recovered: false });

  const root = documentRef.createElement('section');
  root.id = IDS.root;
  root.hidden = true;
  root.setAttribute('data-greyblue-guidance', '');
  root.setAttribute('aria-label', 'Destination guidance');
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('data-guidance-layout', 'wide');

  const eyebrow = documentRef.createElement('span');
  eyebrow.textContent = 'Destination';
  eyebrow.setAttribute('aria-hidden', 'true');
  eyebrow.setAttribute('data-greyblue-guidance-eyebrow', '');

  const label = documentRef.createElement('strong');
  label.id = IDS.label;
  label.setAttribute('data-greyblue-guidance-label', '');

  const status = documentRef.createElement('span');
  status.id = IDS.status;
  status.setAttribute('data-greyblue-guidance-status', '');
  status.setAttribute('role', 'status');

  const live = documentRef.createElement('span');
  live.id = IDS.live;
  live.setAttribute('data-greyblue-guidance-live', '');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.setAttribute('data-visually-hidden', '');

  root.appendChild(eyebrow);
  root.appendChild(label);
  root.appendChild(status);
  root.appendChild(live);
  host.appendChild(root);

  return freeze({ root, created: true, recovered: false });
}

function applyLayout(root, viewportWidth) {
  if (!root || typeof root.setAttribute !== 'function') return;
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1280;
  root.setAttribute('data-guidance-layout', width < 560 ? 'compact' : 'wide');
}

function safeQuery(scope, selector) {
  if (!scope || typeof scope.querySelector !== 'function') return null;
  try { return scope.querySelector(selector); } catch { return null; }
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
