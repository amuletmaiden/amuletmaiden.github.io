const MAX_ID = 120;
const MAX_EVENTS = 512;
const MAX_KNOWN = 256;
const MAX_LEGS = 4;

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function ids(source) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map(cleanId).filter(Boolean))].sort().slice(0, MAX_KNOWN);
}

function eventList(exploration) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  return source.slice(-MAX_EVENTS).filter((event) => event && typeof event === 'object');
}

function completedRoutes(exploration) {
  return new Set(eventList(exploration)
    .filter((event) => event.kind === 'route-completed')
    .map((event) => cleanId(event.routeId || event.id))
    .filter(Boolean));
}

function knownLandmarkConsequences(exploration) {
  const result = new Set();
  for (const event of eventList(exploration)) {
    if (event.kind !== 'landmark-investigated' && event.kind !== 'landmark-flight-encounter') continue;
    const islandId = cleanId(event.islandId);
    if (islandId) result.add(islandId);
  }
  return result;
}

function currentRoost(exploration) {
  return eventList(exploration)
    .filter((event) => event.kind === 'roost-established')
    .map((event) => ({
      islandId: cleanId(event.islandId),
      occurredAt: Number.isFinite(event.occurredAt) ? event.occurredAt : 0,
    }))
    .filter((event) => event.islandId)
    .sort((a, b) => b.occurredAt - a.occurredAt || a.islandId.localeCompare(b.islandId))[0]?.islandId ?? '';
}

function normalizeWorld(world, discoveredIslandIds, discoveredRouteIds) {
  const discoveredIslands = new Set(ids(discoveredIslandIds));
  const discoveredRoutes = new Set(ids(discoveredRouteIds));
  const islands = new Map();
  const rawIslands = Array.isArray(world?.islands) ? world.islands : [];
  for (const island of rawIslands) {
    const id = cleanId(island?.id);
    if (!id || !discoveredIslands.has(id)) continue;
    islands.set(id, Object.freeze({
      id,
      regionId: cleanId(island.regionId) || null,
      hasLandmark: Boolean(island.landmarkRecord?.id || island.landmark),
    }));
  }

  const routes = [];
  const rawRoutes = Array.isArray(world?.routes) ? world.routes : [];
  for (const route of rawRoutes) {
    const id = cleanId(route?.id);
    const fromIslandId = cleanId(route?.fromIslandId);
    const toIslandId = cleanId(route?.toIslandId);
    if (!id || !fromIslandId || !toIslandId || !discoveredRoutes.has(id)) continue;
    if (!islands.has(fromIslandId) || !islands.has(toIslandId)) continue;
    routes.push(Object.freeze({
      id,
      fromIslandId,
      toIslandId,
      kind: cleanId(route.kind) || 'crossing',
    }));
  }
  routes.sort((a, b) => a.id.localeCompare(b.id));
  return { islands, routes };
}

function destinationFor(route, departureId) {
  if (route.fromIslandId === departureId) return route.toIslandId;
  if (route.toIslandId === departureId) return route.fromIslandId;
  return '';
}

function chooseDeparture({ currentIslandId, currentRegionId, roostId, world }) {
  const current = cleanId(currentIslandId);
  if (current && world.islands.has(current)) return current;
  if (roostId && world.islands.has(roostId)) return roostId;
  const region = cleanId(currentRegionId);
  if (region) {
    const member = [...world.islands.values()]
      .filter((island) => island.regionId === region)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (member) return member.id;
  }
  return [...world.islands.keys()].sort()[0] ?? '';
}

function adjacency(world) {
  const graph = new Map([...world.islands.keys()].map((id) => [id, []]));
  for (const route of world.routes) {
    graph.get(route.fromIslandId)?.push({ route, destination: route.toIslandId });
    graph.get(route.toIslandId)?.push({ route, destination: route.fromIslandId });
  }
  for (const edges of graph.values()) {
    edges.sort((a, b) => a.route.id.localeCompare(b.route.id) || a.destination.localeCompare(b.destination));
  }
  return graph;
}

function simplePaths(world, departureIslandId) {
  const graph = adjacency(world);
  const results = [];
  const walk = (islandId, visited, legs) => {
    if (legs.length >= MAX_LEGS) return;
    for (const edge of graph.get(islandId) ?? []) {
      if (visited.has(edge.destination)) continue;
      const nextLegs = [...legs, Object.freeze({ route: edge.route, destinationIslandId: edge.destination })];
      results.push(Object.freeze({
        legs: Object.freeze(nextLegs),
        destinationIslandId: edge.destination,
      }));
      const nextVisited = new Set(visited);
      nextVisited.add(edge.destination);
      walk(edge.destination, nextVisited, nextLegs);
    }
  };
  walk(departureIslandId, new Set([departureIslandId]), []);
  return results;
}

function purposeFor(path, { islands, landmarkConsequences, completed, roostId }) {
  const destination = islands.get(path.destinationIslandId);
  if (destination?.hasLandmark && !landmarkConsequences.has(destination.id)) return 'landmark';
  if (path.legs.some((leg) => !completed.has(leg.route.id))) return 'frontier';
  if (roostId && path.destinationIslandId === roostId && path.legs.length >= 2) return 'roost';
  return 'familiar';
}

function purposeRank(purpose) {
  if (purpose === 'landmark') return 4;
  if (purpose === 'frontier') return 3;
  if (purpose === 'roost') return 2;
  return 1;
}

function pathKey(path) {
  return path.legs.map((leg) => leg.route.id).join('\u0000');
}

function chooseJourney({ world, departureIslandId, exploration, explicitRouteId }) {
  const completed = completedRoutes(exploration);
  const landmarkConsequences = knownLandmarkConsequences(exploration);
  const roostId = currentRoost(exploration);
  let candidates = simplePaths(world, departureIslandId).map((path) => {
    const purpose = purposeFor(path, { islands: world.islands, landmarkConsequences, completed, roostId });
    const novelLegs = path.legs.reduce((count, leg) => count + (completed.has(leg.route.id) ? 0 : 1), 0);
    return { path, purpose, novelLegs };
  });

  const explicit = cleanId(explicitRouteId);
  if (explicit) {
    const preserving = candidates.filter((candidate) => candidate.path.legs[0]?.route.id === explicit);
    if (preserving.length > 0) candidates = preserving;
  }

  candidates.sort((a, b) => {
    const purpose = purposeRank(b.purpose) - purposeRank(a.purpose);
    if (purpose) return purpose;
    const multiA = a.path.legs.length >= 2 ? 1 : 0;
    const multiB = b.path.legs.length >= 2 ? 1 : 0;
    if (multiA !== multiB) return multiB - multiA;
    if (a.purpose === 'landmark' || a.purpose === 'roost') {
      if (a.path.legs.length !== b.path.legs.length) return a.path.legs.length - b.path.legs.length;
    } else if (a.novelLegs !== b.novelLegs) {
      return b.novelLegs - a.novelLegs;
    }
    return pathKey(a.path).localeCompare(pathKey(b.path))
      || a.path.destinationIslandId.localeCompare(b.path.destinationIslandId);
  });
  return candidates[0] ?? null;
}

function publicThread(thread, phase, familiar) {
  if (!thread) return Object.freeze({ active: false, phase: 'idle', familiar: false });
  const first = thread.path.legs[0];
  return Object.freeze({
    active: true,
    phase,
    familiar,
    routeId: first.route.id,
    departureIslandId: thread.departureIslandId,
    destinationIslandId: first.destinationIslandId,
    purpose: thread.purpose,
  });
}

export function deriveExpeditionContext({
  world = null,
  exploration = null,
  discoveredIslandIds = [],
  discoveredRouteIds = [],
  currentIslandId = null,
  currentRegionId = null,
  selectedRouteId = null,
  committedRouteId = null,
  recoveryActive = false,
  cancelled = false,
} = {}) {
  const knownWorld = normalizeWorld(world, discoveredIslandIds, discoveredRouteIds);
  if (recoveryActive || cancelled || knownWorld.routes.length === 0) return publicThread(null, 'idle', false);

  const departureIslandId = chooseDeparture({
    currentIslandId,
    currentRegionId,
    roostId: currentRoost(exploration),
    world: knownWorld,
  });
  if (!departureIslandId) return publicThread(null, 'idle', false);

  const committed = cleanId(committedRouteId);
  const selected = cleanId(selectedRouteId);
  const journey = chooseJourney({
    world: knownWorld,
    departureIslandId,
    exploration,
    explicitRouteId: committed || selected,
  });
  if (!journey) return publicThread(null, 'idle', false);

  const routeId = journey.path.legs[0].route.id;
  const completed = completedRoutes(exploration);
  let phase = 'considering';
  if (committed && committed === routeId) phase = 'crossing';
  if (completed.has(routeId)) phase = 'arrived';
  const familiar = journey.purpose === 'familiar' && completed.has(routeId);
  return publicThread({ ...journey, departureIslandId }, phase, familiar);
}

export function expeditionJournalLine(context) {
  if (!context?.active) return null;
  if (context.phase === 'crossing') {
    if (context.purpose === 'roost') return 'A remembered crossing is carrying you back toward a place of rest.';
    return 'A remembered crossing is carrying forward.';
  }
  if (context.phase === 'arrived') {
    if (context.purpose === 'landmark') return 'The crossing has opened onto a known mystery still unfinished.';
    if (context.purpose === 'frontier') return 'One crossing has settled; another remembered way still has something left in it.';
    if (context.purpose === 'roost') return 'The way back toward your roost has shortened.';
    return 'A familiar crossing has settled behind you.';
  }
  if (context.purpose === 'landmark') return 'Several remembered ways seem to converge on something unfinished.';
  if (context.purpose === 'frontier') return 'A remembered way continues beyond this crossing.';
  if (context.purpose === 'roost') return 'A remembered way bends back toward a place of rest.';
  return 'A familiar crossing remains available.';
}
