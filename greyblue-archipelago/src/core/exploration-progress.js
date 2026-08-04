const EVENT_KINDS = new Set(["region-entered", "landmark-reached", "route-completed"]);

function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanTimestamp(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function eventKey(kind, id) {
  return `${kind}:${id}`;
}

export function normalizeExplorationEvent(input = {}) {
  const kind = EVENT_KINDS.has(input.kind) ? input.kind : null;
  const id = cleanId(input.id);
  if (!kind || !id) return null;

  const event = {
    key: eventKey(kind, id),
    kind,
    id,
    occurredAt: cleanTimestamp(input.occurredAt),
  };
  const regionId = cleanId(input.regionId);
  const routeId = cleanId(input.routeId);
  const landmarkId = cleanId(input.landmarkId);
  if (regionId) event.regionId = regionId;
  if (routeId) event.routeId = routeId;
  if (landmarkId) event.landmarkId = landmarkId;
  return Object.freeze(event);
}

export function restoreExplorationProgress(saved = {}) {
  const byKey = new Map();
  const source = Array.isArray(saved.events) ? saved.events : [];
  for (const candidate of source) {
    const event = normalizeExplorationEvent(candidate);
    if (!event) continue;
    const previous = byKey.get(event.key);
    if (!previous || event.occurredAt < previous.occurredAt) byKey.set(event.key, event);
  }

  const events = [...byKey.values()].sort((left, right) =>
    left.occurredAt - right.occurredAt || left.key.localeCompare(right.key));
  return {
    version: 1,
    events,
    keys: new Set(events.map((event) => event.key)),
    lastEvent: events.at(-1) || null,
  };
}

export function recordExplorationEvent(progress, candidate) {
  const event = normalizeExplorationEvent(candidate);
  if (!event) return { progress, event: null, added: false };

  const current = restoreExplorationProgress(progress);
  if (current.keys.has(event.key)) return { progress: current, event, added: false };

  const events = [...current.events, event].sort((left, right) =>
    left.occurredAt - right.occurredAt || left.key.localeCompare(right.key));
  return {
    event,
    added: true,
    progress: {
      version: 1,
      events,
      keys: new Set(events.map((item) => item.key)),
      lastEvent: events.at(-1) || null,
    },
  };
}

export function serializeExplorationProgress(progress = {}) {
  const restored = restoreExplorationProgress(progress);
  return {
    version: 1,
    events: restored.events.map((event) => ({ ...event })),
  };
}

export function explorationTelemetry(progress = {}) {
  const restored = restoreExplorationProgress(progress);
  const counts = { regions: 0, landmarks: 0, routes: 0 };
  for (const event of restored.events) {
    if (event.kind === "region-entered") counts.regions += 1;
    if (event.kind === "landmark-reached") counts.landmarks += 1;
    if (event.kind === "route-completed") counts.routes += 1;
  }
  return Object.freeze({
    completedCounts: Object.freeze(counts),
    lastDurableDiscovery: restored.lastEvent ? { ...restored.lastEvent } : null,
    eventCount: restored.events.length,
  });
}
