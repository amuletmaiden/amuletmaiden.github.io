import { normalizeGuidanceSettings } from "./guidance-settings-policy.js";

const VERBOSITY_ORDER = Object.freeze(["off", "minimal", "standard"]);

export function reduceGuidanceSettings(input = {}) {
  const previous = normalizeGuidanceSettings(input.settings);
  const action = normalizeAction(input.action);
  let next = previous;
  let changed = false;
  let reason = "unchanged";

  if (action.type === "set-verbosity") {
    next = normalizeGuidanceSettings({ ...previous, verbosity: action.value });
    changed = next.verbosity !== previous.verbosity;
    reason = changed ? "verbosity-set" : "verbosity-unchanged";
  } else if (action.type === "cycle-verbosity") {
    const index = VERBOSITY_ORDER.indexOf(previous.verbosity);
    const direction = action.direction === "backward" ? -1 : 1;
    const nextIndex = (index + direction + VERBOSITY_ORDER.length) % VERBOSITY_ORDER.length;
    next = normalizeGuidanceSettings({ ...previous, verbosity: VERBOSITY_ORDER[nextIndex] });
    changed = true;
    reason = "verbosity-cycled";
  } else if (action.type === "toggle-reduced-motion") {
    next = normalizeGuidanceSettings({ ...previous, reducedMotion: !previous.reducedMotion });
    changed = true;
    reason = "reduced-motion-toggled";
  } else if (action.type === "toggle-sound") {
    next = normalizeGuidanceSettings({ ...previous, soundEnabled: !previous.soundEnabled });
    changed = true;
    reason = "sound-toggled";
  } else if (action.type === "reset") {
    next = normalizeGuidanceSettings({});
    changed = !sameSettings(previous, next);
    reason = changed ? "reset" : "already-default";
  } else if (action.type !== "none") {
    reason = "unsupported-action";
  }

  return freeze({
    settings: next,
    changed,
    announcement: changed
      ? freeze({ id: actionAnnouncementId(action, next), live: "polite" })
      : null,
    persistence: changed
      ? freeze({ key: "greyblue.guidance", value: freeze({
          verbosity: next.verbosity,
          reducedMotion: next.reducedMotion,
          soundEnabled: next.soundEnabled,
        }) })
      : null,
    telemetry: freeze({
      reason,
      actionType: action.type,
      recoveredAction: action.recovered,
    }),
  });
}

export function describeGuidanceControls(settings = {}) {
  const value = normalizeGuidanceSettings(settings);
  return freeze({
    verbosity: freeze({
      value: value.verbosity,
      options: VERBOSITY_ORDER,
      label: "Guidance detail",
    }),
    reducedMotion: freeze({
      value: value.reducedMotion,
      label: "Reduce guidance motion",
    }),
    soundEnabled: freeze({
      value: value.soundEnabled,
      label: "Guidance sound cues",
    }),
  });
}

function normalizeAction(value) {
  if (!value || typeof value !== "object") return freeze({ type: "none", recovered: false });
  const type = text(value.type) ?? "none";
  if (type === "set-verbosity") {
    const requested = text(value.value);
    const valid = VERBOSITY_ORDER.includes(requested);
    return freeze({ type, value: valid ? requested : "standard", recovered: !valid });
  }
  if (type === "cycle-verbosity") {
    return freeze({
      type,
      direction: value.direction === "backward" ? "backward" : "forward",
      recovered: value.direction !== undefined && value.direction !== "backward" && value.direction !== "forward",
    });
  }
  if (["toggle-reduced-motion", "toggle-sound", "reset"].includes(type)) {
    return freeze({ type, recovered: false });
  }
  return freeze({ type, recovered: type !== "none" });
}

function actionAnnouncementId(action, settings) {
  if (action.type === "toggle-reduced-motion") return settings.reducedMotion ? "guidance-motion-reduced" : "guidance-motion-standard";
  if (action.type === "toggle-sound") return settings.soundEnabled ? "guidance-sound-on" : "guidance-sound-off";
  return `guidance-${settings.verbosity}`;
}

function sameSettings(a, b) {
  return a.verbosity === b.verbosity && a.reducedMotion === b.reducedMotion && a.soundEnabled === b.soundEnabled;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
