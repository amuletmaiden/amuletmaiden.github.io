const SAVE_KEY = "greyblue-archipelago-save-v1";
const CURRENT_VERSION = 2;
const DEFAULT_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });
const ZERO_VELOCITY = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_ORIENTATION = Object.freeze({ yaw: 0, pitch: 0, bank: 0 });
const WORLD_LIMIT = 24000;
const ALTITUDE_MIN = -100;
const ALTITUDE_MAX = 8000;
const VELOCITY_LIMIT = 500;
const MAX_DISCOVERY_RECORDS = 2048;

export function saveGame(state, storage = localStorage) {
  const payload = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    seed: Number.isInteger(state.seed) ? state.seed : 1337,
    position: normalizePosition(state.position),
    velocity: normalizeVelocity(state.velocity),
    orientation: normalizeOrientation(state.orientation),
    airborne: state.airborne !== false,
    landingRequested: state.landingRequested === true,
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
    if (!isPlainObject(parsed) || ![1, CURRENT_VERSION].includes(parsed.version)) return null;
    const migratedFromVersion = parsed.version === CURRENT_VERSION ? null : parsed.version;
    return {
      ...parsed,
      version: CURRENT_VERSION,
      seed: Number.isInteger(parsed.seed) ? parsed.seed : 1337,
      position: normalizePosition(parsed.position),
      velocity: normalizeVelocity(parsed.velocity),
      orientation: normalizeOrientation(parsed.orientation),
      airborne: parsed.version === 1 ? true : parsed.airborne !== false,
      landingRequested: parsed.version === 1 ? false : parsed.landingRequested === true,
      discovered: normalizeStringSet(parsed.discovered),
      discoveredRoutes: normalizeStringSet(parsed.discoveredRoutes),
      settings: isPlainObject(parsed.settings) ? parsed.settings : {},
      recoveredCorruptPosition: !isValidWorldPosition(parsed.position),
      recoveredCorruptVelocity: !isValidVelocity(parsed.velocity),
      migratedFromVersion,
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
    velocity: { ...ZERO_VELOCITY },
    orientation: normalizeOrientation(state?.orientation),
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

export function isValidVelocity(velocity) {
  if (!velocity || typeof velocity !== "object") return false;
  return [velocity.x, velocity.y, velocity.z].every((value) =>
    Number.isFinite(value) && Math.abs(value) <= VELOCITY_LIMIT
  );
}

function normalizePosition(position) {
  if (!isValidWorldPosition(position)) return { ...DEFAULT_SPAWN };
  return {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z),
  };
}

function normalizeVelocity(velocity) {
  if (!isValidVelocity(velocity)) return { ...ZERO_VELOCITY };
  return {
    x: Number(velocity.x),
    y: Number(velocity.y),
    z: Number(velocity.z),
  };
}

function normalizeOrientation(orientation) {
  if (!orientation || typeof orientation !== "object") return { ...DEFAULT_ORIENTATION };
  return {
    yaw: finiteAngle(orientation.yaw),
    pitch: finiteAngle(orientation.pitch),
    bank: finiteAngle(orientation.bank),
  };
}

function finiteAngle(value) {
  if (!Number.isFinite(value)) return 0;
  const wrapped = Number(value) % (Math.PI * 2);
  return Object.is(wrapped, -0) ? 0 : wrapped;
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
