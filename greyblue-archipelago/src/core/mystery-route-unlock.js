const MAX_IDS = 512;

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function cleanIds(values) {
  const source = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return [...new Set(source.map(cleanId).filter(Boolean))].slice(0, MAX_IDS);
}

function worldCollections(world) {
  return {
    islands: Array.isArray(world?.islands) ? world.islands : [],
    routes: Array.isArray(world?.routes) ? world.routes : [],
    regions: Array.isArray(world?.regions) ? world.regions : [],
  };
}

function investigationRecords(exploration) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  const records = [];
  const seen = new Set();
  for (const candidate of source) {
    if (!candidate || candidate.kind !== 'landmark-investigated') continue;
    const landmarkId = cleanId(candidate.landmarkId || candidate.id);
    const regionId = cleanId(candidate.regionId);
    if (!landmarkId || !regionId || seen.has(landmarkId)) continue;
    seen.add(landmarkId);
    records.push({ landmarkId, regionId });
  }
  return records.slice(0, MAX_IDS);
}

export function evaluateMysteryRouteUnlocks({
  world,
  exploration = null,
  discoveredIslandIds = [],
  discoveredRouteIds = [],
  liveInvestigation = null,
} = {}) {
  const { islands, routes, regions } = worldCollections(world);
  const islandById = new Map(islands.map((island) => [cleanId(island?.id), island]).filter(([id]) => id));
  const regionIds = new Set(regions.map((region) => cleanId(region?.id)).filter(Boolean));
  const discoveredIslands = new Set(cleanIds(discoveredIslandIds));
  const discoveredRoutes = new Set(cleanIds(discoveredRouteIds));
  const records = investigationRecords(exploration);
  const liveLandmarkId = cleanId(liveInvestigation?.landmarkId);
  const liveRegionId = cleanId(liveInvestigation?.regionId);
  if (liveLandmarkId && liveRegionId && !records.some((record) => record.landmarkId === liveLandmarkId)) {
    records.push({ landmarkId: liveLandmarkId, regionId: liveRegionId });
  }

  const authoredLandmarksByRegion = new Map();
  for (const island of islands) {
    const regionId = cleanId(island?.regionId);
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    if (!regionId || !landmarkId) continue;
    if (!authoredLandmarksByRegion.has(regionId)) authoredLandmarksByRegion.set(regionId, new Set());
    authoredLandmarksByRegion.get(regionId).add(landmarkId);
  }

  const investigatedByRegion = new Map();
  for (const record of records) {
    if (regionIds.size && !regionIds.has(record.regionId)) continue;
    const authored = authoredLandmarksByRegion.get(record.regionId);
    if (authored && !authored.has(record.landmarkId)) continue;
    if (!investigatedByRegion.has(record.regionId)) investigatedByRegion.set(record.regionId, new Set());
    investigatedByRegion.get(record.regionId).add(record.landmarkId);
  }

  const regionProgress = [];
  for (const [regionId, authored] of authoredLandmarksByRegion) {
    const required = Math.min(2, authored.size);
    if (required <= 0) continue;
    const investigated = investigatedByRegion.get(regionId)?.size ?? 0;
    regionProgress.push(Object.freeze({
      regionId,
      investigated,
      required,
      ready: investigated >= required,
    }));
  }
  regionProgress.sort((left, right) => left.regionId.localeCompare(right.regionId));

  const unlocks = [];
  for (const route of routes) {
    const routeId = cleanId(route?.id);
    if (!routeId || route?.kind !== 'far-ring' || discoveredRoutes.has(routeId)) continue;
    const fromId = cleanId(route?.fromIslandId);
    const toId = cleanId(route?.toIslandId);
    if (!fromId || !toId || !discoveredIslands.has(fromId) || !discoveredIslands.has(toId)) continue;
    const from = islandById.get(fromId);
    const to = islandById.get(toId);
    if (!from || !to) continue;
    const qualifyingRegionIds = [...new Set([cleanId(from.regionId), cleanId(to.regionId)].filter(Boolean))]
      .filter((regionId) => regionProgress.some((progress) => progress.regionId === regionId && progress.ready));
    if (!qualifyingRegionIds.length) continue;
    unlocks.push(Object.freeze({
      routeId,
      fromIslandId: fromId,
      toIslandId: toId,
      qualifyingRegionIds: qualifyingRegionIds.sort(),
    }));
  }
  unlocks.sort((left, right) => left.routeId.localeCompare(right.routeId));

  return Object.freeze({
    unlocks: Object.freeze(unlocks),
    regionProgress: Object.freeze(regionProgress),
    investigationCount: records.length,
  });
}
