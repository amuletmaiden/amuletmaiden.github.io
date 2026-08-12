import { normalizeFlightResume } from "./flight-resume.js";

const SAVE_KEY = "greyblue-archipelago-save-v1";
const CURRENT_VERSION = 3;
const SUPPORTED_VERSIONS = new Set([1, 2, CURRENT_VERSION]);
const EXPLORATION_VERSION = 1;
const DEFAULT_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });
const WORLD_LIMIT = 24000;
const ALTITUDE_MIN = -100;
const ALTITUDE_MAX = 8000;
const MAX_DISCOVERY_RECORDS = 2048;
const EXPLORATION_EVENT_KINDS = new Set(["region-entered", "landmark-reached", "landmark-investigated", "landmark-flight-encounter", "route-completed", "approach-mastered", "roost-established", "regional-thread-recognized", "regional-flight-memory"]);
const REGIONAL_FLIGHT_MEMORY_CLASSES = new Set(["wake", "ring", "hush", "weathering"]);
let runtimeRecoveryCheckpoint = null;
let holdRecoveryCheckpointOnce = false;

export function saveGame(state, storage = localStorage, guidanceContext = null) {
  const discoveredRoutes = normalizeStringSet(state.discoveredRoutes);
  const context = guidanceContext
    ? { ...guidanceContext, discoveredRoutes: guidanceContext.discoveredRoutes ?? discoveredRoutes }
    : null;
  const guidanceResult = recoverGuidanceForWorld(state.guidance, context);
  const previousExploration = state.exploration === undefined
    ? readStoredExploration(storage)
    : null;
  const previousSettings = readStoredSettings(storage);
  const position = normalizePosition(state.position);
  const previousPosition = readStoredPosition(storage);
  if (holdRecoveryCheckpointOnce) {
    holdRecoveryCheckpointOnce = false;
  } else if (previousPosition && !samePosition(previousPosition, position)) {
    runtimeRecoveryCheckpoint = previousPosition;
  } else if (!runtimeRecoveryCheckpoint) {
    runtimeRecoveryCheckpoint = previousPosition ?? position;
  }
  const payload = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    seed: Number.isInteger(state.seed) ? state.seed : 1337,
    position,
    recoveryCheckpoint: normalizePosition(runtimeRecoveryCheckpoint ?? position),
    flight: normalizeFlightResume(state.flight),
    discovered: normalizeStringSet(state.discovered),
    discoveredRoutes,
    guidance: guidanceResult.guidance,
    exploration: normalizeExploration(state.exploration ?? previousExploration),
    settings: {
      ...previousSettings,
      ...(isPlainObject(state.settings) ? state.settings : {}),
    },
  };
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
  return { ...payload, guidanceRecovery: guidanceResult.recovery };
}

export function saveSettingsPatch(settings, storage = localStorage) {
  if (!isPlainObject(settings)) return false;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !SUPPORTED_VERSIONS.has(parsed.version)) return false;
    parsed.settings = {
      ...(isPlainObject(parsed.settings) ? parsed.settings : {}),
      ...settings,
    };
    storage.setItem(SAVE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage = localStorage, guidanceContext = null) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !isPlainObject(parsed) || !SUPPORTED_VERSIONS.has(parsed.version)) return null;
    const discoveredRoutes = normalizeStringSet(parsed.discoveredRoutes);
    const context = guidanceContext
      ? { ...guidanceContext, discoveredRoutes: guidanceContext.discoveredRoutes ?? discoveredRoutes }
      : null;
    const guidanceResult = recoverGuidanceForWorld(parsed.guidance, context);
    const hadExplorationField = Object.hasOwn(parsed, "exploration");
    const hadFlightField = Object.hasOwn(parsed, "flight");
    const exploration = normalizeExploration(parsed.exploration);
    const flight = normalizeFlightResume(parsed.flight);
    const position = normalizePosition(parsed.position);
    runtimeRecoveryCheckpoint = isValidWorldPosition(parsed.recoveryCheckpoint)
      ? normalizePosition(parsed.recoveryCheckpoint)
      : position;
    holdRecoveryCheckpointOnce = false;
    return {
      ...parsed,
      version: CURRENT_VERSION,
      seed: Number.isInteger(parsed.seed) ? parsed.seed : 1337,
      position,
      recoveryCheckpoint: { ...runtimeRecoveryCheckpoint },
      flight,
      flightRecovery: {
        hadFlightField,
        recoveredNeutral: !hadFlightField,
      },
      discovered: normalizeStringSet(parsed.discovered),
      discoveredRoutes,
      guidance: guidanceResult.guidance,
      guidanceRecovery: guidanceResult.recovery,
      exploration,
      explorationRecovery: {
        hadExplorationField,
        restoredEventCount: exploration.events.length,
        recoveredEmpty: !hadExplorationField || exploration.events.length === 0,
      },
      settings: isPlainObject(parsed.settings) ? parsed.settings : {},
      recoveredCorruptPosition: !isValidWorldPosition(parsed.position),
      recoveredCorruptCheckpoint: Object.hasOwn(parsed, "recoveryCheckpoint") && !isValidWorldPosition(parsed.recoveryCheckpoint),
      migratedFromVersion: parsed.version === CURRENT_VERSION ? null : parsed.version,
    };
  } catch {
    return null;
  }
}

export function clearSave(storage = localStorage) {
  storage.removeItem(SAVE_KEY);
  runtimeRecoveryCheckpoint = null;
  holdRecoveryCheckpointOnce = false;
}

export function safeRespawn(state, spawn = DEFAULT_SPAWN) {
  const earned = globalThis.__greyblueRoostRecovery;
  const earnedTarget = earned?.source === "earned-roost" && isValidWorldPosition(earned?.position)
    ? earned.position
    : null;
  const target = earnedTarget
    ?? (isValidWorldPosition(runtimeRecoveryCheckpoint) ? runtimeRecoveryCheckpoint : spawn);
  const position = normalizePosition(target);
  runtimeRecoveryCheckpoint = { ...position };
  holdRecoveryCheckpointOnce = true;
  return {
    ...state,
    position,
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    landingRequested: false,
    recoverySource: earnedTarget ? "earned-roost" : "checkpoint",
    recoveryHeading: earnedTarget && Number.isFinite(earned?.heading) ? Number(earned.heading) : null,
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

export function normalizeGuidanceForWorld(guidance, context = null) {
  return recoverGuidanceForWorld(guidance, context).guidance;
}

export function recoverGuidanceForWorld(guidance, context = null) {
  const normalized = normalizeGuidance(guidance);
  if (!normalized) {
    return {
      guidance: null,
      recovery: context && guidance != null
        ? recoveryRecord("malformed-guidance", null, context.validation)
        : null,
    };
  }
  if (!context) return { guidance: normalized, recovery: null };
  if (context.validation && context.validation.valid !== true) {
    return {
      guidance: null,
      recovery: recoveryRecord("world-validation-failed", normalized.activeRouteId, context.validation),
    };
  }

  const routeIds = normalizeIdLookup(context.routeIds);
  if (routeIds && !routeIds.has(normalized.activeRouteId)) {
    return {
      guidance: null,
      recovery: recoveryRecord("unknown-route", normalized.activeRouteId, context.validation),
    };
  }

  const discoveredRoutes = normalizeIdLookup(context.discoveredRoutes);
  if (discoveredRoutes && !discoveredRoutes.has(normalized.activeRouteId)) {
    return {
      guidance: null,
      recovery: recoveryRecord("undiscovered-route", normalized.activeRouteId, context.validation),
    };
  }

  return { guidance: normalized, recovery: null };
}

function recoveryRecord(reason, activeRouteId, validation) {
  return {
    reason,
    activeRouteId,
    validation: summarizeValidation(validation),
  };
}

function summarizeValidation(validation) {
  if (!isPlainObject(validation)) return null;
  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  const codes = normalizeStringSet(validation.diagnostics?.codes ?? issues.map((entry) => entry?.code));
  const invariants = normalizeStringSet(validation.diagnostics?.invariants ?? issues.map((entry) => entry?.invariant));
  const severities = normalizeStringSet(validation.diagnostics?.severities ?? issues.map((entry) => entry?.severity));
  const highestSeverity = typeof validation.diagnostics?.highestSeverity === "string"
    ? validation.diagnostics.highestSeverity
    : severities[0] ?? null;
  return {
    contractVersion: Number.isInteger(validation.contractVersion) ? validation.contractVersion : null,
    issueCount: Number.isInteger(validation.diagnostics?.issueCount)
      ? Math.max(0, validation.diagnostics.issueCount)
      : issues.length,
    highestSeverity,
    primaryInvariant: invariants[0] ?? null,
    severities,
    codes: codes.sort(),
    invariants: invariants.sort(),
  };
}

function normalizePosition(position) {
  if (!isValidWorldPosition(position)) return { ...DEFAULT_SPAWN };
  return {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z),
  };
}

function samePosition(left, right) {
  return Boolean(left) && Boolean(right)
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z;
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

function normalizeIdLookup(values) {
  if (values == null) return null;
  return new Set(normalizeStringSet(values));
}

function normalizeGuidance(guidance) {
  if (!isPlainObject(guidance)) return null;
  const activeRouteId = typeof guidance.activeRouteId === "string"
    ? guidance.activeRouteId.trim()
    : "";
  if (!activeRouteId) return null;
  const numericProgress = Number(guidance.progress);
  const progress = Number.isFinite(numericProgress)
    ? Math.max(0, Math.min(1, numericProgress))
    : 0;
  return { activeRouteId, progress };
}

function readStoredPosition(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) && isValidWorldPosition(parsed.position)
      ? normalizePosition(parsed.position)
      : null;
  } catch {
    return null;
  }
}

function readStoredExploration(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed.exploration ?? null : null;
  } catch {
    return null;
  }
}

function readStoredSettings(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) && isPlainObject(parsed.settings)
      ? parsed.settings
      : {};
  } catch {
    return {};
  }
}

function normalizeExploration(exploration) {
  const source = isPlainObject(exploration) && Array.isArray(exploration.events)
    ? exploration.events
    : [];
  const byKey = new Map();
  for (const candidate of source.slice(0, MAX_DISCOVERY_RECORDS)) {
    if (!isPlainObject(candidate) || !EXPLORATION_EVENT_KINDS.has(candidate.kind)) continue;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id) continue;
    const key = `${candidate.kind}:${id}`;
    const event = {
      key,
      kind: candidate.kind,
      id,
      occurredAt: Number.isFinite(candidate.occurredAt) && candidate.occurredAt >= 0
        ? Math.floor(candidate.occurredAt)
        : 0,
    };
    for (const field of ["regionId", "routeId", "landmarkId", "islandId", "corridorId", "landingZoneId", "encounterClass"]) {
      const value = typeof candidate[field] === "string" ? candidate[field].trim() : "";
      if (value) event[field] = value;
    }
    if (candidate.kind === "regional-flight-memory") {
      const memoryClass = typeof candidate.memoryClass === "string" ? candidate.memoryClass.trim() : "";
      if (!REGIONAL_FLIGHT_MEMORY_CLASSES.has(memoryClass)) continue;
      event.memoryClass = memoryClass;
    }
    const previous = byKey.get(key);
    if (!previous || event.occurredAt < previous.occurredAt) byKey.set(key, event);
  }
  return {
    version: EXPLORATION_VERSION,
    events: [...byKey.values()].sort((left, right) =>
      left.occurredAt - right.occurredAt || left.key.localeCompare(right.key)),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
