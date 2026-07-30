function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeIds(values) {
  if (values instanceof Set) return values;
  return new Set(Array.isArray(values) ? values : []);
}

export function rankConnectedRoutes(
  world,
  {
    islandId,
    discoveredRouteIds = [],
    altitude = 0,
    preferredRegionId = null,
  } = {},
) {
  if (!world || !Array.isArray(world.routes) || !Array.isArray(world.islands) || !islandId) return [];

  const discovered = normalizeIds(discoveredRouteIds);
  const islandById = new Map(world.islands.map((island) => [island.id, island]));
  const rankings = [];

  for (const route of world.routes) {
    if (!discovered.has(route.id)) continue;
    const departingFromStart = route.fromIslandId === islandId;
    const departingFromEnd = route.toIslandId === islandId;
    if (!departingFromStart && !departingFromEnd) continue;

    const destinationIslandId = departingFromStart ? route.toIslandId : route.fromIslandId;
    const destination = islandById.get(destinationIslandId);
    if (!destination) continue;

    const navigation = route.navigation || {};
    const minimumAltitude = Number.isFinite(navigation.minimumAltitude) ? navigation.minimumAltitude : 0;
    const cruiseAltitude = Number.isFinite(navigation.cruiseAltitude) ? navigation.cruiseAltitude : minimumAltitude;
    const distance = Number.isFinite(navigation.distance) ? navigation.distance : Number.POSITIVE_INFINITY;
    const fogRiskScore = clamp(Number(navigation.fogRisk?.score) || 0, 0, 1);
    const altitudeDeficit = Math.max(0, minimumAltitude - (Number.isFinite(altitude) ? altitude : 0));
    const destinationRegionId = departingFromStart ? route.toRegionId : route.fromRegionId;
    const regionPenalty = preferredRegionId && destinationRegionId !== preferredRegionId ? 0.08 : 0;
    const distanceScore = clamp(distance / 6000, 0, 1);
    const altitudePenalty = clamp(altitudeDeficit / 600, 0, 1);
    const score = distanceScore * 0.5 + altitudePenalty * 0.28 + fogRiskScore * 0.22 + regionPenalty;

    rankings.push({
      routeId: route.id,
      destinationIslandId,
      destinationRegionId: destinationRegionId || destination.regionId || null,
      bearing: departingFromStart ? navigation.bearingFrom ?? null : navigation.bearingTo ?? null,
      distance,
      minimumAltitude,
      cruiseAltitude,
      altitudeDeficit,
      fogRisk: {
        score: fogRiskScore,
        level: navigation.fogRisk?.level || "low",
      },
      score,
    });
  }

  return rankings.sort((left, right) =>
    left.score - right.score
    || left.distance - right.distance
    || left.routeId.localeCompare(right.routeId),
  );
}
