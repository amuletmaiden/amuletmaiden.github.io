import {
  explorationTelemetry,
  recordExplorationEvent,
  restoreExplorationProgress,
  serializeExplorationProgress,
} from "./exploration-progress.js";

const FLUSH_REASONS = new Set([
  "periodic-save",
  "pause",
  "unload",
  "reset-recovery",
  "safe-respawn",
]);
const MAX_ERROR_TEXT = 160;

export function createExplorationRuntime({
  world,
  restoredLedger,
  persist = () => {},
  now = () => Date.now(),
} = {}) {
  const ids = collectWorldIds(world);
  let progress = restoreExplorationProgress(restoredLedger);
  const restoredEventCount = progress.events.length;
  let lastAcceptedEvent = progress.lastEvent ? { ...progress.lastEvent } : null;
  let lastFlushReason = null;
  let flushCount = 0;
  let persistFailureCount = 0;
  let lastPersistError = null;

  function record(kind, id, allowedIds, extra = {}) {
    const cleanId = normalizeId(id);
    if (!cleanId) return result(false, "invalid-id", null);
    if (!allowedIds.has(cleanId)) return result(false, "unknown-id", null);

    const recorded = recordExplorationEvent(progress, {
      kind,
      id: cleanId,
      occurredAt: safeNow(now),
      ...extra,
    });
    progress = recorded.progress;
    if (!recorded.added) return result(false, "duplicate", recorded.event);
    lastAcceptedEvent = recorded.event ? { ...recorded.event } : null;
    return result(true, "accepted", recorded.event);
  }

  function result(accepted, reason, event) {
    return Object.freeze({
      accepted,
      reason,
      event: event ? Object.freeze({ ...event }) : null,
      snapshot: snapshot(),
    });
  }

  function recordRegionEntry(id) {
    return record("region-entered", id, ids.regions, { regionId: normalizeId(id) });
  }

  function recordLandmarkArrival(id) {
    return record("landmark-reached", id, ids.landmarks, { landmarkId: normalizeId(id) });
  }

  function recordRouteCompletion(id, explicitSignal = false) {
    if (explicitSignal !== true) return result(false, "explicit-signal-required", null);
    return record("route-completed", id, ids.routes, { routeId: normalizeId(id) });
  }

  function snapshot() {
    return deepFreeze(serializeExplorationProgress(progress));
  }

  function flush(reason) {
    if (!FLUSH_REASONS.has(reason)) {
      return Object.freeze({
        persisted: false,
        reason: "unsupported-flush-reason",
        flushReason: null,
        snapshot: snapshot(),
      });
    }

    const durable = snapshot();
    flushCount += 1;
    lastFlushReason = reason;
    try {
      persist(durable, reason);
      lastPersistError = null;
      return Object.freeze({
        persisted: true,
        reason: "persisted",
        flushReason: reason,
        snapshot: durable,
      });
    } catch (error) {
      persistFailureCount += 1;
      lastPersistError = boundedError(error);
      return Object.freeze({
        persisted: false,
        reason: "persist-failed",
        flushReason: reason,
        snapshot: durable,
      });
    }
  }

  function telemetry() {
    const durable = explorationTelemetry(progress);
    return deepFreeze({
      completedCounts: { ...durable.completedCounts },
      eventCount: durable.eventCount,
      lastAcceptedEvent: lastAcceptedEvent ? { ...lastAcceptedEvent } : null,
      restoredEventCount,
      flushCount,
      lastFlushReason,
      persistFailureCount,
      lastPersistError,
      continuity: persistFailureCount > 0 ? "degraded" : "intact",
    });
  }

  return Object.freeze({
    recordRegionEntry,
    recordLandmarkArrival,
    recordRouteCompletion,
    snapshot,
    flush,
    telemetry,
  });
}

function collectWorldIds(world) {
  const regions = new Set();
  const routes = new Set();
  const landmarks = new Set();

  for (const region of Array.isArray(world?.regions) ? world.regions : []) {
    const id = normalizeId(region?.id);
    if (id) regions.add(id);
  }
  for (const route of Array.isArray(world?.routes) ? world.routes : []) {
    const id = normalizeId(route?.id);
    if (id) routes.add(id);
  }
  for (const island of Array.isArray(world?.islands) ? world.islands : []) {
    for (const candidate of [island?.landmarkRecord?.id, island?.landmarkEncounter?.id]) {
      const id = normalizeId(candidate);
      if (id) landmarks.add(id);
    }
  }

  return Object.freeze({ regions, routes, landmarks });
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeNow(now) {
  try {
    const value = Number(now());
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function boundedError(error) {
  const text = error instanceof Error ? error.message : String(error ?? "persist failed");
  return text.slice(0, MAX_ERROR_TEXT);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
