const EXPLORATION_VERSION = 1;
const VALID_KINDS = new Set(["region-entered", "landmark-reached", "landmark-investigated", "route-completed", "approach-mastered", "roost-established"]);

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTime(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeEvent(candidate) {
  if (!candidate || typeof candidate !== "object" || !VALID_KINDS.has(candidate.kind)) return null;
  const id = cleanId(candidate.id);
  if (!id) return null;
  const event = {
    key: `${candidate.kind}:${id}`,
    kind: candidate.kind,
    id,
    occurredAt: cleanTime(candidate.occurredAt),
  };
  for (const field of ["regionId", "routeId", "landmarkId", "islandId", "corridorId", "landingZoneId"]) {
    const value = cleanId(candidate[field]);
    if (value) event[field] = value;
  }
  return event;
}

export function investigatedLandmarkIdsFromExploration(exploration = null) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  const ids = [];
  for (const candidate of source) {
    const event = normalizeEvent(candidate);
    if (event?.kind !== "landmark-investigated") continue;
    const landmarkId = cleanId(event.landmarkId || event.id);
    if (landmarkId) ids.push(landmarkId);
  }
  return [...new Set(ids)].slice(0, 256);
}

export function masteredApproachIdsFromExploration(exploration = null) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  const ids = [];
  for (const candidate of source) {
    const event = normalizeEvent(candidate);
    if (event?.kind !== "approach-mastered") continue;
    const corridorId = cleanId(event.corridorId || event.id);
    if (corridorId) ids.push(corridorId);
  }
  return [...new Set(ids)].slice(0, 256);
}

export function createExplorationLifecycle(initialExploration = null) {
  const events = new Map();
  const source = Array.isArray(initialExploration?.events) ? initialExploration.events : [];
  for (const candidate of source) {
    const event = normalizeEvent(candidate);
    if (!event) continue;
    const previous = events.get(event.key);
    if (!previous || event.occurredAt < previous.occurredAt) events.set(event.key, event);
  }

  let dirty = false;

  function record(event) {
    const normalized = normalizeEvent(event);
    if (!normalized || events.has(normalized.key)) return false;
    events.set(normalized.key, normalized);
    dirty = true;
    return true;
  }

  function replaceRoost(event) {
    const normalized = normalizeEvent(event);
    if (!normalized || normalized.kind !== "roost-established") return false;
    const current = [...events.values()]
      .filter((candidate) => candidate.kind === "roost-established")
      .sort((left, right) => right.occurredAt - left.occurredAt || right.key.localeCompare(left.key))[0] ?? null;
    if (current && current.islandId === normalized.islandId && current.landingZoneId === normalized.landingZoneId) return false;
    for (const [key, candidate] of events) {
      if (candidate.kind === "roost-established") events.delete(key);
    }
    events.set(normalized.key, normalized);
    dirty = true;
    return true;
  }

  return {
    recordRegion(region, occurredAt = Date.now()) {
      const regionId = cleanId(region?.id);
      if (!regionId) return false;
      return record({ kind: "region-entered", id: regionId, regionId, occurredAt });
    },

    recordLandmark(landmark, regionId = null, occurredAt = Date.now()) {
      const landmarkId = cleanId(landmark?.id);
      if (!landmarkId) return false;
      return record({
        kind: "landmark-reached",
        id: landmarkId,
        landmarkId,
        regionId: cleanId(regionId),
        occurredAt,
      });
    },

    recordLandmarkInvestigation(landmarkId, regionId = null, occurredAt = Date.now()) {
      const id = cleanId(landmarkId);
      if (!id) return false;
      return record({
        kind: "landmark-investigated",
        id,
        landmarkId: id,
        regionId: cleanId(regionId),
        occurredAt,
      });
    },

    recordRouteCompletion(routeId, occurredAt = Date.now()) {
      const id = cleanId(routeId);
      if (!id) return false;
      return record({ kind: "route-completed", id, routeId: id, occurredAt });
    },

    recordApproachMastery(islandId, corridorId, occurredAt = Date.now()) {
      const island = cleanId(islandId);
      const corridor = cleanId(corridorId);
      if (!island || !corridor) return false;
      return record({
        kind: "approach-mastered",
        id: corridor,
        islandId: island,
        corridorId: corridor,
        occurredAt,
      });
    },

    recordRoost(islandId, landingZoneId, occurredAt = Date.now()) {
      const island = cleanId(islandId);
      const zone = cleanId(landingZoneId);
      if (!island || !zone) return false;
      return replaceRoost({
        kind: "roost-established",
        id: zone,
        islandId: island,
        landingZoneId: zone,
        occurredAt,
      });
    },

    markFlushed() {
      dirty = false;
    },

    get dirty() {
      return dirty;
    },

    snapshot() {
      return {
        version: EXPLORATION_VERSION,
        events: [...events.values()].sort((left, right) =>
          left.occurredAt - right.occurredAt || left.key.localeCompare(right.key)),
      };
    },

    telemetry() {
      const values = [...events.values()];
      return {
        eventCount: values.length,
        regionCount: values.filter((event) => event.kind === "region-entered").length,
        landmarkCount: values.filter((event) => event.kind === "landmark-reached").length,
        landmarkInvestigationCount: values.filter((event) => event.kind === "landmark-investigated").length,
        routeCompletionCount: values.filter((event) => event.kind === "route-completed").length,
        approachMasteryCount: values.filter((event) => event.kind === "approach-mastered").length,
        roostCount: values.filter((event) => event.kind === "roost-established").length,
        dirty,
      };
    },
  };
}
