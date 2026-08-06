import { normalizeGuidanceSettings } from "./guidance-settings-policy.js";
import { describeGuidanceControls, reduceGuidanceSettings } from "./guidance-settings-controls.js";

const STORAGE_KEY = "greyblue.guidance";

export function createGuidanceSettingsSession(input = {}) {
  const storage = normalizeStorage(input.storage);
  const announce = typeof input.announce === "function" ? input.announce : null;
  let settings = readSettings(storage);
  let lastAnnouncementId = null;

  function dispatch(action) {
    const result = reduceGuidanceSettings({ settings, action });
    settings = result.settings;

    let persisted = false;
    let persistenceError = null;
    if (result.persistence) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(result.persistence.value));
        persisted = true;
      } catch (error) {
        persistenceError = safeError(error);
      }
    }

    let announced = false;
    if (result.announcement && result.announcement.id !== lastAnnouncementId) {
      lastAnnouncementId = result.announcement.id;
      if (announce) {
        try {
          announce(result.announcement);
          announced = true;
        } catch {
          announced = false;
        }
      }
    }

    return freeze({
      settings,
      controls: describeGuidanceControls(settings),
      changed: result.changed,
      persisted,
      announced,
      announcement: result.announcement,
      telemetry: freeze({
        ...result.telemetry,
        persistenceError,
        storageRecovered: storage.recovered,
      }),
    });
  }

  function snapshot() {
    return freeze({
      settings,
      controls: describeGuidanceControls(settings),
      storageRecovered: storage.recovered,
    });
  }

  return freeze({ dispatch, snapshot });
}

function readSettings(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return normalizeGuidanceSettings({});
    const parsed = JSON.parse(raw);
    return normalizeGuidanceSettings(parsed);
  } catch {
    return normalizeGuidanceSettings({});
  }
}

function normalizeStorage(value) {
  if (value && typeof value.getItem === "function" && typeof value.setItem === "function") {
    return freeze({
      recovered: false,
      getItem: value.getItem.bind(value),
      setItem: value.setItem.bind(value),
    });
  }

  const memory = new Map();
  return freeze({
    recovered: true,
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, next) {
      memory.set(key, String(next));
    },
  });
}

function safeError(error) {
  if (!error) return "unknown";
  if (typeof error === "string") return error.slice(0, 120);
  if (typeof error.message === "string") return error.message.slice(0, 120);
  return "unknown";
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
