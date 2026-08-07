function normalizeIds(values) {
  if (values instanceof Set) return new Set(values);
  return new Set(Array.isArray(values) ? values : []);
}

function boundedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

export function listRouteChoices({ world, islandId, discoveredRouteIds } = {}) {
  const departureId = boundedId(islandId);
  if (!departureId || !Array.isArray(world?.routes) || !Array.isArray(world?.islands)) return [];
  const discovered = normalizeIds(discoveredRouteIds);
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
    }));
  }

  return Object.freeze(choices.sort((left, right) =>
    left.destinationName.localeCompare(right.destinationName)
    || left.routeId.localeCompare(right.routeId),
  ));
}

export function cycleRouteChoice({
  world,
  islandId,
  discoveredRouteIds,
  preferredRouteId = null,
  activeCrossingRouteId = null,
} = {}) {
  const current = boundedId(preferredRouteId);
  const locked = boundedId(activeCrossingRouteId);
  if (locked) {
    return Object.freeze({ changed: false, preferredRouteId: current, reason: 'active-crossing', choices: Object.freeze([]), destinationName: null });
  }

  const choices = listRouteChoices({ world, islandId, discoveredRouteIds });
  if (!choices.length) {
    return Object.freeze({ changed: false, preferredRouteId: current, reason: 'no-eligible-routes', choices, destinationName: null });
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
  });
}
