import { rankConnectedRoutes } from "../world/route-ranking.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function selectRouteGuidance({
  world,
  island,
  discoveredRouteIds,
  altitude,
  preferredRouteId = null,
  preferredRegionId = null,
} = {}) {
  if (!island?.id) return { guidance: null, preferredRouteId: null };

  const ranked = rankConnectedRoutes(world, {
    islandId: island.id,
    discoveredRouteIds,
    altitude,
    preferredRegionId,
  });
  if (!ranked.length) return { guidance: null, preferredRouteId: null };

  const preferred = preferredRouteId
    ? ranked.find((entry) => entry.routeId === preferredRouteId) || null
    : null;
  const selected = preferred || ranked[0];
  const destination = world.islands.find((candidate) => candidate.id === selected.destinationIslandId) || null;
  if (!destination) return { guidance: null, preferredRouteId: null };

  const remainingDistance = Math.hypot(
    Number(island.position?.x ?? 0) - destination.x,
    Number(island.position?.z ?? 0) - destination.z,
  );
  const progress = selected.distance > 0
    ? clamp(1 - remainingDistance / selected.distance, 0, 1)
    : 0;

  return {
    preferredRouteId: selected.routeId,
    guidance: {
      ...selected,
      destinationName: destination.name,
      remainingDistance,
      progress,
      fallbackFromPreferred: Boolean(preferredRouteId && !preferred),
    },
  };
}
