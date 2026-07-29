const TAU = Math.PI * 2;

export const REGION_DEFINITIONS = Object.freeze([
  {
    id: "hushed-reach",
    name: "The Hushed Reach",
    mood: "Low islands vanish into pearl-grey rain and return as silhouettes.",
    adjectives: ["Hushed", "Veiled", "Pale", "Listening", "Rainbound"],
    nouns: ["Bell", "Shoal", "Lantern", "Needle", "Hollow"],
    landmarkKinds: ["listening stone", "drowned bell", "wind aperture"],
  },
  {
    id: "drowned-crown",
    name: "The Drowned Crown",
    mood: "A broken ring of high basalt remembers a mountain the sea took apart.",
    adjectives: ["Drowned", "Crowned", "Broken", "Black", "Tidal"],
    nouns: ["Diadem", "Spire", "Throne", "Gate", "Cairn"],
    landmarkKinds: ["crown stair", "tide throne", "split observatory"],
  },
  {
    id: "blueglass-wake",
    name: "The Blueglass Wake",
    mood: "Cold light travels beneath the water and wakes ruined instruments at dusk.",
    adjectives: ["Blueglass", "Cold", "Lucent", "Cerulean", "Waking"],
    nouns: ["Lens", "Wake", "Mirror", "Beacon", "Vault"],
    landmarkKinds: ["signal lens", "glass reef", "weather engine"],
  },
  {
    id: "widow-current",
    name: "The Widow Current",
    mood: "Long currents pull south through steep, narrow isles and abandoned landings.",
    adjectives: ["Widow", "Long", "Ashen", "Sable", "Forsaken"],
    nouns: ["Jetty", "Pass", "Mast", "House", "Anchor"],
    landmarkKinds: ["empty jetty", "stone mast", "anchor shrine"],
  },
  {
    id: "mothwater",
    name: "Mothwater",
    mood: "Warm lights drift through the mist where no inhabited windows remain.",
    adjectives: ["Mothlit", "Amber", "Soft", "Sleepless", "Fallow"],
    nouns: ["Window", "Garden", "Archive", "Porch", "Furnace"],
    landmarkKinds: ["lamp archive", "sealed garden", "ember cistern"],
  },
  {
    id: "far-choir",
    name: "The Far Choir",
    mood: "Remote pillars answer one another across distances too large for voices.",
    adjectives: ["Far", "Choral", "Resonant", "Last", "Vigilant"],
    nouns: ["Choir", "Pillar", "Organ", "Watch", "Reliquary"],
    landmarkKinds: ["resonance pillar", "choir bridge", "vigil reliquary"],
  },
]);

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

function regionFor(angle) {
  const sector = Math.floor((wrapAngle(angle) / TAU) * REGION_DEFINITIONS.length);
  return REGION_DEFINITIONS[Math.min(sector, REGION_DEFINITIONS.length - 1)];
}

function choose(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function makeUniqueName(region, random, usedNames) {
  const base = `The ${choose(region.adjectives, random)} ${choose(region.nouns, random)}`;
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) name = `${base} ${suffix++}`;
  usedNames.add(name);
  return name;
}

function makeLandingMetadata(island, bearing, random) {
  const outerDistance = 310 + island.scale * 130;
  const touchdownDistance = Math.max(20, island.landingRadius * 0.28);
  const width = clamp(island.landingRadius * 0.9, 70, 210);
  const touchdownX = island.x + Math.cos(bearing) * touchdownDistance;
  const touchdownZ = island.z + Math.sin(bearing) * touchdownDistance;
  const entryX = island.x + Math.cos(bearing) * outerDistance;
  const entryZ = island.z + Math.sin(bearing) * outerDistance;
  const heading = wrapAngle(bearing + Math.PI);
  const zone = {
    id: `${island.id}:landing-0`,
    x: touchdownX,
    y: Math.max(8, island.height * 0.08),
    z: touchdownZ,
    radius: clamp(island.landingRadius * 0.58, 48, 130),
    heading,
    surface: random() > 0.55 ? "rain-cut stone" : "mossed shelf",
  };
  const corridor = {
    id: `${island.id}:approach-0`,
    entry: { x: entryX, y: Math.max(90, island.height * 0.32), z: entryZ },
    touchdown: { x: zone.x, y: zone.y + 8, z: zone.z },
    heading,
    width,
    minimumAltitude: Math.max(45, island.height * 0.18),
    maximumDescentRate: 34,
  };
  return { landingZones: [zone], approachCorridors: [corridor] };
}

function buildRegionAndRouteRecords(islands) {
  const regions = REGION_DEFINITIONS.map((definition) => {
    const members = islands
      .filter((island) => island.regionId === definition.id)
      .sort((a, b) => a.distanceFromOrigin - b.distanceFromOrigin || a.id.localeCompare(b.id));
    return {
      id: definition.id,
      name: definition.name,
      mood: definition.mood,
      islandIds: members.map((island) => island.id),
      anchorIslandId: members.find((island) => island.landmark)?.id ?? members[0]?.id ?? null,
    };
  });

  const routes = [];
  for (const region of regions) {
    for (let index = 1; index < region.islandIds.length; index += 1) {
      routes.push({
        id: `route:${region.id}:${index - 1}`,
        kind: "regional-chain",
        regionId: region.id,
        fromIslandId: region.islandIds[index - 1],
        toIslandId: region.islandIds[index],
      });
    }
  }

  const anchors = regions.map((region) => region.anchorIslandId).filter(Boolean);
  for (let index = 0; index < anchors.length; index += 1) {
    const next = anchors[(index + 1) % anchors.length];
    if (next && next !== anchors[index]) {
      routes.push({
        id: `route:ring:${index}`,
        kind: "far-ring",
        regionId: null,
        fromIslandId: anchors[index],
        toIslandId: next,
      });
    }
  }

  const routeIdsByIsland = new Map(islands.map((island) => [island.id, []]));
  for (const route of routes) {
    routeIdsByIsland.get(route.fromIslandId)?.push(route.id);
    routeIdsByIsland.get(route.toIslandId)?.push(route.id);
  }
  for (const island of islands) island.routeIds = routeIdsByIsland.get(island.id) ?? [];

  return { regions, routes };
}

export function buildArchipelago({ seed = 1337, count = 48, radius = 9000, minGap = 420 } = {}) {
  const random = mulberry32(seed);
  const islands = [];
  const usedNames = new Set();
  let attempts = 0;

  while (islands.length < count && attempts++ < count * 240) {
    const angle = random() * TAU;
    const distance = 500 + Math.sqrt(random()) * radius;
    const region = regionFor(angle);
    const island = {
      id: `isle-${islands.length}`,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      scale: 0.65 + random() * 2.4,
      height: 80 + random() * 520,
      landmark: random() > 0.72,
      landingRadius: 70 + random() * 120,
      regionId: region.id,
      regionName: region.name,
      distanceFromOrigin: distance,
    };

    const separated = islands.every((other) =>
      Math.hypot(other.x - island.x, other.z - island.z) >=
      minGap * (other.scale + island.scale) * 0.5,
    );

    if (!separated) continue;

    island.name = makeUniqueName(region, random, usedNames);
    const bearing = wrapAngle(angle + Math.PI + (random() - 0.5) * 0.8);
    Object.assign(island, makeLandingMetadata(island, bearing, random));
    const landmarkKind = island.landmark ? choose(region.landmarkKinds, random) : null;
    island.landmarkRecord = landmarkKind
      ? {
          id: `${island.id}:landmark`,
          title: `${island.name} · ${landmarkKind}`,
          kind: landmarkKind,
          clue: region.mood,
        }
      : null;
    island.discovery = {
      id: `${island.id}:discovery`,
      title: island.name,
      regionId: region.id,
      regionName: region.name,
      summary: island.landmarkRecord?.clue ?? region.mood,
      threshold: clamp(island.landingRadius * 1.5, 180, 330),
    };
    islands.push(island);
  }

  const { regions, routes } = buildRegionAndRouteRecords(islands);
  return { seed, radius, minGap, islands, regions, routes };
}

export function activeIslands(world, position, range = 1800) {
  const rangeSquared = range * range;
  return world.islands.filter((island) => {
    const dx = island.x - position.x;
    const dz = island.z - position.z;
    return dx * dx + dz * dz <= rangeSquared;
  });
}

export function updateActiveIslands(
  world,
  position,
  activeIds = new Set(),
  { activateRange = 1800, deactivateRange = 2200 } = {},
) {
  if (deactivateRange < activateRange) {
    throw new RangeError("deactivateRange must be greater than or equal to activateRange");
  }
  const activeSet = activeIds instanceof Set ? activeIds : new Set(activeIds);
  const activateSquared = activateRange * activateRange;
  const deactivateSquared = deactivateRange * deactivateRange;
  return world.islands.filter((island) => {
    const dx = island.x - position.x;
    const dz = island.z - position.z;
    const distanceSquared = dx * dx + dz * dz;
    const threshold = activeSet.has(island.id) ? deactivateSquared : activateSquared;
    return distanceSquared <= threshold;
  });
}
