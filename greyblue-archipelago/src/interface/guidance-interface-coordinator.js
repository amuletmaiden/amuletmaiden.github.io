import { createGuidanceLiveMount } from './guidance-live-mount.js';
import { createGuidanceHelpAffordance } from './guidance-help-affordance.js';
import { createGuidanceHelpDomBinding } from './guidance-help-dom-binding.js';

function safeCall(fn, ...args) {
  try {
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch {
    return undefined;
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createGuidanceInterfaceCoordinator(options = {}) {
  const telemetry = {
    renders: 0,
    helpDispatches: 0,
    settingsDispatches: 0,
    viewportUpdates: 0,
    announcements: 0,
    suppressedAnnouncements: 0,
  };
  let disposed = false;
  let lastAnnouncement = null;

  const liveMount = createGuidanceLiveMount({
    documentLike: options.documentLike,
    storage: options.storage,
    ids: options.settingsIds,
    isOpen: options.settingsOpen === true,
    viewportWidth: finite(options.viewportWidth, 1280),
  });

  const helpModel = createGuidanceHelpAffordance({
    shortcut: options.shortcut,
    open: options.helpOpen === true,
    publish(event) {
      publishAnnouncement(event?.text);
    },
  });

  const helpBinding = createGuidanceHelpDomBinding({
    documentLike: options.documentLike,
    ids: options.helpIds,
    dispatch(action) {
      telemetry.helpDispatches += 1;
      const state = helpModel.dispatch(action);
      helpBinding.render(state);
      return state;
    },
  });

  function publishAnnouncement(value) {
    if (disposed || typeof value !== 'string' || !value.trim()) return false;
    const announcement = value.trim().slice(0, 160);
    if (announcement === lastAnnouncement) {
      telemetry.suppressedAnnouncements += 1;
      return false;
    }
    lastAnnouncement = announcement;
    telemetry.announcements += 1;
    safeCall(liveMount.announce, announcement);
    safeCall(options.onAnnouncement, freeze({ text: announcement }));
    return true;
  }

  function render() {
    if (disposed) return snapshot({ changed: false, reason: 'disposed' });
    const settings = liveMount.render();
    const help = helpModel.inspect();
    const helpRender = helpBinding.render(help);
    telemetry.renders += 1;
    return snapshot({ changed: Boolean(settings?.render?.changed || helpRender?.changed), settings, help, helpRender });
  }

  function dispatchSettings(action = {}) {
    if (disposed) return snapshot({ routed: false, reason: 'disposed' });
    telemetry.settingsDispatches += 1;
    const settings = liveMount.dispatch(action);
    return snapshot({ routed: true, settings });
  }

  function dispatchHelp(action = {}) {
    if (disposed) return snapshot({ routed: false, reason: 'disposed' });
    telemetry.helpDispatches += 1;
    const help = helpModel.dispatch(action);
    const helpRender = helpBinding.render(help);
    return snapshot({ routed: true, help, helpRender });
  }

  function setViewportWidth(value) {
    if (disposed) return snapshot({ changed: false, reason: 'disposed' });
    telemetry.viewportUpdates += 1;
    const settings = liveMount.setViewportWidth(finite(value, liveMount.snapshot().viewportWidth));
    return snapshot({ changed: true, settings });
  }

  function setSettingsOpen(value) {
    if (disposed) return snapshot({ changed: false, reason: 'disposed' });
    const settings = liveMount.setOpen(value === true);
    return snapshot({ changed: true, settings });
  }

  function announce(value) {
    return snapshot({ announced: publishAnnouncement(value) });
  }

  function dispose() {
    if (disposed) return snapshot({ disposed: true, changed: false });
    disposed = true;
    const help = safeCall(helpModel.dispose);
    const helpBindingResult = safeCall(helpBinding.dispose);
    return snapshot({ disposed: true, changed: true, help, helpBinding: helpBindingResult });
  }

  function snapshot(extra = {}) {
    return freeze({
      ...extra,
      disposed,
      settings: safeCall(liveMount.snapshot) ?? null,
      help: safeCall(helpModel.inspect) ?? null,
      telemetry: { ...telemetry },
    });
  }

  return freeze({
    render,
    dispatchSettings,
    dispatchHelp,
    setViewportWidth,
    setSettingsOpen,
    announce,
    snapshot,
    dispose,
  });
}
