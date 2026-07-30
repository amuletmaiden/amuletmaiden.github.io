const SAVE_KEY = "greyblue-archipelago-save-v1";
const CURRENT_VERSION = 2;
const DEFAULT_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });
const WORLD_LIMIT = 24000;
const ALTITUDE_MIN = -100;
const ALTITUDE_MAX = 8000;
const MAX_DISCOVERY_RECORDS = 2048;

export function saveGame(state, storage = localStorage) {
  const payload = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    seed: Number.isInteger(state.seed) ? state.seed : 1337,
    position: normalizePosition(state.position),
    discovered: normalizeStringSet(state.discovered),
    discoveredRoutes: normalizeStringSet(state.discoveredRoutes),
    settings: isPlainObject(state.settings) ? state.settings : {},
  };
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function loadGame(storage = localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !isPlainObject(parsed) || ![1, CURRENT_VERSION].includes(parsed.version)) return null;
    return {
      ...parsed,
      version: CURRENT_VERSION,
      seed: Number.isInteger(parsed.seed) ? parsed.seed : 1337,
      position: normalizePosition(parsed.position),
      discovered: normalizeStringSet(parsed.discovered),
      discoveredRoutes: normalizeStringSet(parsed.discoveredRoutes),
      settings: isPlainObject(parsed.settings) ? parsed.settings : {},
      recoveredCorruptPosition: !isValidWorldPosition(parsed.position),
      migratedFromVersion: parsed.version === CURRENT_VERSION ? null : parsed.version,
    };
  } catch {
    return null;
  }
}

export function clearSave(storage = localStorage) {
  storage.removeItem(SAVE_KEY);
}

export function safeRespawn(state, spawn = DEFAULT_SPAWN) {
  return {
    ...state,
    position: normalizePosition(spawn),
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    landingRequested: false,
  };
}

export function isValidWorldPosition(position) {
  if (!position || typeof position !== "object") return false;
  const { x, y, z } = position;
  return [x, y, z].every(Number.isFinite)
    && Math.abs(x) <= WORLD_LIMIT
    && Math.abs(z) <= WORLD_LIMIT
    && y >= ALTITUDE_MIN
    && y <= ALTITUDE_MAX;
}

function normalizePosition(position) {
  if (!isValidWorldPosition(position)) return { ...DEFAULT_SPAWN };
  return {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z),
  };
}

function normalizeStringSet(values) {
  const source = values instanceof Set
    ? [...values]
    : Array.isArray(values)
      ? values
      : [];
  return [...new Set(
    source
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_DISCOVERY_RECORDS),
  )];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
