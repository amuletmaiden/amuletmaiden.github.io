const INACTIVE_STATE = Object.freeze({ completed: false, newLandfall: false });

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.z);
}

function truthfulTouchdown(collision) {
  return collision?.grounded === true
    && collision?.reason === "touchdown"
    && collision?.requiresRecovery === false;
}

function eligibleZone(zone, position) {
  if (!finitePoint(zone) || !Number.isFinite(zone?.radius) || zone.radius <= 0) return null;
  const distance = Math.hypot(position.x - zone.x, position.z - zone.z);
  if (!Number.isFinite(distance) || distance > zone.radius) return null;
  return distance;
}

function alreadyLanded(events, islandId) {
  return Array.isArray(events) && events.some((event) =>
    event?.kind === "island-landed" && event?.islandId === islandId);
}

export function deriveIslandLandfall({
  collision = null,
  position = null,
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
} = {}) {
  if (!truthfulTouchdown(collision) || !finitePoint(position) || !Array.isArray(islands)) {
    return Object.freeze({ state: INACTIVE_STATE, event: null, islandName: null });
  }

  const discovered = discoveredIslandIds instanceof Set
    ? discoveredIslandIds
    : new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds : []);
  let match = null;

  for (const island of islands) {
    if (!island?.id || !island?.regionId || !discovered.has(island.id) || !Array.isArray(island.landingZones)) continue;
    for (const zone of island.landingZones) {
      const distance = eligibleZone(zone, position);
      if (distance === null) continue;
      if (!match || distance < match.distance) match = { island, distance };
    }
  }

  if (!match) return Object.freeze({ state: INACTIVE_STATE, event: null, islandName: null });

  const duplicate = alreadyLanded(explorationEvents, match.island.id);
  const state = Object.freeze({ completed: true, newLandfall: !duplicate });
  if (duplicate) return Object.freeze({ state, event: null, islandName: null });

  const event = Object.freeze({
    kind: "island-landed",
    islandId: match.island.id,
    regionId: match.island.regionId,
  });
  const islandName = typeof match.island.name === "string" && match.island.name.trim()
    ? match.island.name.trim().slice(0, 96)
    : null;
  return Object.freeze({ state, event, islandName });
}
