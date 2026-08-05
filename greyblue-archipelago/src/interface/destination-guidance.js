const DISTANCE_BANDS = Object.freeze([
  [120, "arrival"],
  [500, "near"],
  [1800, "mid"],
  [Number.POSITIVE_INFINITY, "far"],
]);

export function planDestinationGuidance(input = {}) {
  const position = point(input.position);
  const completed = new Set(strings(input.completedLandmarkIds));
  const previousAnnouncementId = text(input.previousAnnouncementId);
  const reducedMotion = Boolean(input.reducedMotion);
  const candidates = normalizeCandidates(input.landmarks)
    .filter((candidate) => !completed.has(candidate.id))
    .map((candidate) => ({ ...candidate, distance: distance(position, candidate.position) }))
    .sort((left, right) => left.routeOrder - right.routeOrder || left.distance - right.distance || left.id.localeCompare(right.id));

  const destination = candidates[0] ?? null;
  if (!destination) {
    return freeze({
      destination: null,
      announcement: null,
      telemetry: { reason: "no-destination", candidateCount: candidates.length, reducedMotion },
    });
  }

  const bearing = bearingDegrees(position, destination.position);
  const distanceBand = DISTANCE_BANDS.find(([limit]) => destination.distance <= limit)[1];
  const phase = distanceBand === "arrival" ? "arrived" : distanceBand === "near" ? "approach" : "en-route";
  const announcementId = phase === "arrived" ? `arrival:${destination.id}` : phase === "approach" ? `approach:${destination.id}` : null;
  const announcement = announcementId && announcementId !== previousAnnouncementId
    ? freeze({ id: announcementId, destinationId: destination.id, kind: phase, live: "polite" })
    : null;

  return freeze({
    destination: freeze({
      id: destination.id,
      name: destination.name,
      bearingDegrees: bearing,
      distance: destination.distance,
      distanceBand,
      phase,
      motion: reducedMotion ? "none" : "subtle",
      soundHookId: destination.soundHookId,
    }),
    announcement,
    telemetry: freeze({ reason: "selected", candidateCount: candidates.length, reducedMotion }),
  });
}

function normalizeCandidates(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = text(item.id);
    const name = text(item.name);
    const position = point(item.position, null);
    if (!id || !name || !position || byId.has(id)) continue;
    byId.set(id, freeze({
      id,
      name,
      position,
      routeOrder: finite(item.routeOrder, Number.MAX_SAFE_INTEGER),
      soundHookId: text(item.soundHookId),
    }));
  }
  return [...byId.values()];
}

function point(value, fallback = { x: 0, y: 0, z: 0 }) {
  if (!value || typeof value !== "object") return fallback;
  const x = finite(value.x, NaN);
  const y = finite(value.y, NaN);
  const z = finite(value.z, NaN);
  return [x, y, z].every(Number.isFinite) ? freeze({ x, y, z }) : fallback;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function bearingDegrees(a, b) {
  const degrees = Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

function strings(value) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    return Object.freeze(value);
  }
  return value;
}
