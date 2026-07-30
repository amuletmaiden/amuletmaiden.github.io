const PROFILE_BY_REGION = Object.freeze({
  "hushed-reach": Object.freeze({
    fog: Object.freeze({ color: "#8ea2aa", near: 180, far: 1500, density: 0.00072 }),
    visibility: "close-veiled",
    cue: "Rain hushes the sea until nearby stone appears without warning.",
  }),
  "drowned-crown": Object.freeze({
    fog: Object.freeze({ color: "#74858d", near: 260, far: 2100, density: 0.00048 }),
    visibility: "broken-vistas",
    cue: "Basalt crowns surface in pieces, never revealing the whole ring at once.",
  }),
  "blueglass-wake": Object.freeze({
    fog: Object.freeze({ color: "#6d91a6", near: 320, far: 2500, density: 0.00038 }),
    visibility: "cold-luminous",
    cue: "Blue light beneath the water outlines routes before the islands themselves.",
  }),
  "widow-current": Object.freeze({
    fog: Object.freeze({ color: "#78858a", near: 220, far: 1800, density: 0.00058 }),
    visibility: "long-channel",
    cue: "Narrow channels stay legible while their shores dissolve into ash-grey mist.",
  }),
  mothwater: Object.freeze({
    fog: Object.freeze({ color: "#86959a", near: 240, far: 1950, density: 0.00052 }),
    visibility: "warm-points",
    cue: "Amber points persist through the fog after every other shape has vanished.",
  }),
  "far-choir": Object.freeze({
    fog: Object.freeze({ color: "#71818b", near: 420, far: 3200, density: 0.00028 }),
    visibility: "distant-pillars",
    cue: "Remote pillars remain visible beyond the range where ordinary islands disappear.",
  }),
});

export const DEFAULT_MYSTERY_PROFILE = Object.freeze({
  fog: Object.freeze({ color: "#7f9098", near: 260, far: 2000, density: 0.0005 }),
  visibility: "greyblue",
  cue: "Mist keeps the horizon uncertain.",
});

export function mysteryProfileForRegion(regionId) {
  return PROFILE_BY_REGION[regionId] || DEFAULT_MYSTERY_PROFILE;
}

export function landmarkEncounterFor(island) {
  if (!island?.landmarkRecord) return null;
  const kind = island.landmarkRecord.kind || "unknown landmark";
  return {
    id: `${island.landmarkRecord.id}:encounter`,
    islandId: island.id,
    regionId: island.regionId,
    title: island.landmarkRecord.title,
    approachText: `Through the mist: ${kind}.`,
    arrivalText: island.landmarkRecord.clue || island.discovery?.summary || "The place offers no explanation.",
    triggerRadius: clamp((island.discovery?.threshold || 240) * 0.72, 120, 260),
    revealOrder: ["silhouette", "title", "clue"],
  };
}

export function routeDiscoveryFor(route, islandById) {
  const from = islandById.get(route.fromIslandId);
  const to = islandById.get(route.toIslandId);
  if (!from || !to) return null;
  const midpoint = {
    x: (from.x + to.x) * 0.5,
    z: (from.z + to.z) * 0.5,
  };
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  return {
    id: `${route.id}:discovery`,
    routeId: route.id,
    kind: route.kind,
    regionId: route.regionId,
    fromIslandId: from.id,
    toIslandId: to.id,
    midpoint,
    triggerRadius: clamp(length * 0.16, 180, 520),
    title: route.kind === "far-ring"
      ? `Far passage: ${from.name} — ${to.name}`
      : `${from.name} to ${to.name}`,
  };
}

export function enrichWorldMystery(world) {
  const islandById = new Map(world.islands.map((island) => [island.id, island]));
  const regionMystery = Object.fromEntries(
    world.regions.map((region) => [region.id, mysteryProfileForRegion(region.id)]),
  );
  const landmarkEncounters = world.islands
    .map(landmarkEncounterFor)
    .filter(Boolean);
  const routeDiscoveries = world.routes
    .map((route) => routeDiscoveryFor(route, islandById))
    .filter(Boolean);
  return {
    regionMystery,
    landmarkEncounters,
    routeDiscoveries,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
