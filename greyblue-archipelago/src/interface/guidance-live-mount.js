import { createGuidanceSettingsSession } from './guidance-settings-session.js';
import { createGuidanceSettingsSurface, routeGuidanceSettingsSurfaceAction } from './guidance-settings-surface.js';
import { createGuidanceDomBinding } from './guidance-dom-binding.js';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function createGuidanceLiveMount(options = {}) {
  let isOpen = options.isOpen === true;
  let viewportWidth = Math.max(0, finite(options.viewportWidth, 1280));
  const binding = createGuidanceDomBinding({
    documentLike: options.documentLike,
    ids: options.ids,
    dispatch,
  });
  const session = createGuidanceSettingsSession({
    storage: options.storage,
    announce: (announcement) => binding.announce(announcement),
  });
  const telemetry = { dispatches: 0, renders: 0, closes: 0 };

  function render() {
    const snapshot = session.snapshot();
    const surface = createGuidanceSettingsSurface({
      settings: snapshot.settings,
      isOpen,
      viewportWidth,
    });
    const result = binding.render(surface, snapshot.settings);
    if (result.changed) telemetry.renders += 1;
    return state({ surface, render: result });
  }

  function dispatch(action = {}) {
    const routed = routeGuidanceSettingsSurfaceAction(action);
    telemetry.dispatches += 1;
    if (routed.type === 'close-settings') {
      isOpen = false;
      telemetry.closes += 1;
      return render();
    }
    if (routed.type !== 'noop') session.dispatch(routed);
    return render();
  }

  function setOpen(next) {
    isOpen = next === true;
    return render();
  }

  function setViewportWidth(next) {
    viewportWidth = Math.max(0, finite(next, viewportWidth));
    return render();
  }

  function announce(announcement) {
    return binding.announce(announcement);
  }

  function state(extra = {}) {
    return Object.freeze({
      ...extra,
      isOpen,
      viewportWidth,
      session: session.snapshot(),
      telemetry: Object.freeze({ ...telemetry }),
    });
  }

  return Object.freeze({ render, dispatch, setOpen, setViewportWidth, announce, snapshot: state });
}
