import { loadGame } from './save.js';

function normalizeIds(values) {
  if (values instanceof Set) return new Set([...values].map(boundedId).filter(Boolean));
  return new Set((Array.isArray(values) ? values : []).map(boundedId).filter(Boolean));
}

function boundedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

export function traversedRouteIdsFromExploration(exploration = null) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  const ids = [];
  for (const event of source) {
    if (event?.kind !== 'route-completed') continue;
    const routeId = boundedId(event.routeId || event.id);
    if (routeId) ids.push(routeId);
  }
  return Object.freeze([...new Set(ids)]);
}

function restoredTraversedRouteIds() {
  const storage = globalThis.localStorage;
  if (!storage?.getItem) return new Set();
  try {
    return new Set(traversedRouteIdsFromExploration(loadGame(storage)?.exploration));
  } catch {
    return new Set();
  }
}

export function listRouteChoices({ world, islandId, discoveredRouteIds, traversedRouteIds } = {}) {
  const departureId = boundedId(islandId);
  if (!departureId || !Array.isArray(world?.routes) || !Array.isArray(world?.islands)) return [];
  const discovered = normalizeIds(discoveredRouteIds);
  const traversed = traversedRouteIds === undefined ? restoredTraversedRouteIds() : normalizeIds(traversedRouteIds);
  const islands = new Map(world.islands.map((island) => [island?.id, island]));
  const choices = [];

  for (const route of world.routes) {
    const routeId = boundedId(route?.id);
    if (!routeId || !discovered.has(routeId)) continue;
    const from = route?.fromIslandId === departureId;
    const to = route?.toIslandId === departureId;
    if (!from && !to) continue;
    const destinationId = boundedId(from ? route?.toIslandId : route?.fromIslandId);
    const destination = destinationId ? islands.get(destinationId) : null;
    if (!destination) continue;
    choices.push(Object.freeze({
      routeId,
      destinationIslandId: destinationId,
      destinationName: String(destination.name || destinationId).slice(0, 120),
      traversed: traversed.has(routeId),
    }));
  }

  return Object.freeze(choices.sort((left, right) =>
    Number(left.traversed) - Number(right.traversed)
    || left.destinationName.localeCompare(right.destinationName)
    || left.routeId.localeCompare(right.routeId),
  ));
}

export function cycleRouteChoice({
  world,
  islandId,
  discoveredRouteIds,
  traversedRouteIds,
  preferredRouteId = null,
  activeCrossingRouteId = null,
} = {}) {
  const current = boundedId(preferredRouteId);
  const locked = boundedId(activeCrossingRouteId);
  if (locked) {
    return Object.freeze({ changed: false, preferredRouteId: current, reason: 'active-crossing', choices: Object.freeze([]), destinationName: null, familiarity: null });
  }

  const choices = listRouteChoices({ world, islandId, discoveredRouteIds, traversedRouteIds });
  if (!choices.length) {
    return Object.freeze({ changed: false, preferredRouteId: current, reason: 'no-eligible-routes', choices, destinationName: null, familiarity: null });
  }

  const currentIndex = choices.findIndex((choice) => choice.routeId === current);
  const nextIndex = choices.length === 1 ? 0 : (currentIndex + 1 + choices.length) % choices.length;
  const selected = choices[nextIndex];
  return Object.freeze({
    changed: selected.routeId !== current,
    preferredRouteId: selected.routeId,
    reason: choices.length === 1 ? 'single-route' : 'cycled',
    choices,
    destinationName: selected.destinationName,
    familiarity: selected.traversed ? 'familiar' : 'unfamiliar',
  });
}
