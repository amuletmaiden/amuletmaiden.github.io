const DEFAULT_RADIUS = 1800;
const MAX_SOURCE_COUNT = 512;

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function ids(values) {
  if (!values || typeof values[Symbol.iterator] !== "function") return new Set();
  const result = new Set();
  for (const value of values) {
    const id = cleanId(value);
    if (id) result.add(id);
    if (result.size >= MAX_SOURCE_COUNT) break;
  }
  return result;
}

function explorationEvents(exploration) {
  return Array.isArray(exploration?.events) ? exploration.events.slice(0, MAX_SOURCE_COUNT) : [];
}

function distanceWeight(position, point, radius) {
  if (!point) return 0;
  const dx = finite(position?.x) - finite(point.x, Number.NaN);
  const dz = finite(position?.z) - finite(point.z, Number.NaN);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return 0;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

function islandPoint(island) {
  return Number.isFinite(island?.x) && Number.isFinite(island?.z)
    ? { x: island.x, z: island.z }
    : null;
}

function routePoint(route, islandsById) {
  const midpoint = route?.discovery?.midpoint;
  if (Number.isFinite(midpoint?.x) && Number.isFinite(midpoint?.z)) return midpoint;
  const from = islandsById.get(cleanId(route?.fromIslandId));
  const to = islandsById.get(cleanId(route?.toIslandId));
  if (!from || !to) return null;
  return { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
}

export function evaluateLocalFamiliarity({
  world,
  position,
  currentRegionId = null,
  discoveredIslandIds = [],
  discoveredRouteIds = [],
  exploration = null,
  radius = DEFAULT_RADIUS,
} = {}) {
  const safeRadius = Math.max(300, Math.min(3200, finite(radius, DEFAULT_RADIUS)));
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const discoveredIslands = ids(discoveredIslandIds);
  const discoveredRoutes = ids(discoveredRouteIds);
  const islandsById = new Map(islands.map((island) => [cleanId(island?.id), island]).filter(([id]) => id));
  const routesById = new Map(routes.map((route) => [cleanId(route?.id), route]).filter(([id]) => id));
  const events = explorationEvents(exploration);
  const regionId = cleanId(currentRegionId);

  let localEvidence = 0;
  let strongest = 0;
  let sourceCount = 0;

  const add = (weight, strength) => {
    const contribution = clamp01(weight) * clamp01(strength);
    if (contribution <= 0) return;
    localEvidence += contribution;
    strongest = Math.max(strongest, contribution);
    sourceCount += 1;
  };

  for (const islandId of discoveredIslands) {
    const island = islandsById.get(islandId);
    add(distanceWeight(position, islandPoint(island), safeRadius), 0.32);
  }

  const seenEventKeys = new Set();
  for (const event of events) {
    const kind = cleanId(event?.kind);
    const eventId = cleanId(event?.id || event?.landmarkId || event?.routeId || event?.corridorId || event?.regionId);
    if (!kind || !eventId) continue;
    const key = `${kind}:${eventId}`;
    if (seenEventKeys.has(key)) continue;
    seenEventKeys.add(key);

    if (kind === "region-entered") {
      if (regionId && cleanId(event?.regionId || event?.id) === regionId) add(1, 0.12);
      continue;
    }

    if (kind === "landmark-reached" || kind === "landmark-investigated") {
      const landmarkId = cleanId(event?.landmarkId || event?.id);
      const island = islands.find((candidate) =>
        discoveredIslands.has(cleanId(candidate?.id))
        && cleanId(candidate?.landmarkRecord?.id || candidate?.landmark?.id) === landmarkId);
      add(distanceWeight(position, islandPoint(island), safeRadius), kind === "landmark-investigated" ? 0.24 : 0.14);
      continue;
    }

    if (kind === "approach-mastered") {
      const islandId = cleanId(event?.islandId);
      if (!discoveredIslands.has(islandId)) continue;
      add(distanceWeight(position, islandPoint(islandsById.get(islandId)), safeRadius), 0.22);
      continue;
    }

    if (kind === "route-completed") {
      const routeId = cleanId(event?.routeId || event?.id);
      if (!discoveredRoutes.has(routeId)) continue;
      const route = routesById.get(routeId);
      const fromId = cleanId(route?.fromIslandId);
      const toId = cleanId(route?.toIslandId);
      if (!discoveredIslands.has(fromId) || !discoveredIslands.has(toId)) continue;
      add(distanceWeight(position, routePoint(route, islandsById), safeRadius * 1.15), 0.2);
    }
  }

  const familiarity = clamp01(1 - Math.exp(-localEvidence * 1.35));
  const densityMultiplier = 1 - familiarity * 0.16;
  const nearContrast = familiarity * 0.1;

  return Object.freeze({
    familiarity,
    densityMultiplier,
    nearContrast,
    strongestSource: strongest,
    sourceCount,
    radius: safeRadius,
  });
}
