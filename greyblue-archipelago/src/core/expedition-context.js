const MAX_ID = 120;
const MAX_EVENTS = 512;

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function ids(source) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map(cleanId).filter(Boolean))].sort().slice(0, 256);
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
    const member = [...world.islands.values()].find((island) => island.regionId === region);
    if (member) return member.id;
  }
  return [...world.islands.keys()][0] ?? '';
}

function candidateScore(route, destination, completed, landmarkConsequences, islands) {
  let score = 0;
  if (!completed.has(route.id)) score += 4;
  const destinationRecord = islands.get(destination);
  if (destinationRecord?.hasLandmark && !landmarkConsequences.has(destination)) score += 2;
  if (route.kind === 'far-ring') score += 1;
  return score;
}

function publicThread(thread, phase, familiar) {
  if (!thread) return Object.freeze({ active: false, phase: 'idle', familiar: false });
  return Object.freeze({
    active: true,
    phase,
    familiar,
    routeId: thread.routeId,
    departureIslandId: thread.departureIslandId,
    destinationIslandId: thread.destinationIslandId,
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

  const completed = completedRoutes(exploration);
  const landmarkConsequences = knownLandmarkConsequences(exploration);
  const departureIslandId = chooseDeparture({
    currentIslandId,
    currentRegionId,
    roostId: currentRoost(exploration),
    world: knownWorld,
  });
  if (!departureIslandId) return publicThread(null, 'idle', false);

  const candidates = knownWorld.routes
    .map((route) => ({ route, destination: destinationFor(route, departureIslandId) }))
    .filter((candidate) => candidate.destination)
    .map((candidate) => ({
      ...candidate,
      score: candidateScore(candidate.route, candidate.destination, completed, landmarkConsequences, knownWorld.islands),
    }))
    .sort((a, b) => b.score - a.score || a.route.id.localeCompare(b.route.id) || a.destination.localeCompare(b.destination));
  if (candidates.length === 0) return publicThread(null, 'idle', false);

  const selected = cleanId(selectedRouteId);
  const committed = cleanId(committedRouteId);
  const explicitlyChosen = candidates.find((candidate) => candidate.route.id === (committed || selected));
  const choice = explicitlyChosen ?? candidates[0];
  const thread = {
    routeId: choice.route.id,
    departureIslandId,
    destinationIslandId: choice.destination,
  };

  let phase = 'considering';
  if (committed && committed === choice.route.id) phase = 'crossing';
  if (completed.has(choice.route.id)) phase = 'arrived';
  const familiar = completed.has(choice.route.id)
    && (!knownWorld.islands.get(choice.destination)?.hasLandmark || landmarkConsequences.has(choice.destination));
  return publicThread(thread, phase, familiar);
}

export function expeditionJournalLine(context) {
  if (!context?.active) return null;
  if (context.phase === 'crossing') return 'A remembered crossing is carrying forward.';
  if (context.phase === 'arrived') return context.familiar
    ? 'A familiar crossing has settled behind you.'
    : 'The crossing has opened onto something not yet exhausted.';
  return context.familiar
    ? 'A familiar crossing remains available.'
    : 'One remembered crossing still seems to lead somewhere unfinished.';
}
