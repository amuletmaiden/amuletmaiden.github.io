export function createExplorationJournalState(initial = {}) {
  return Object.freeze({
    lastDiscoveryKey: typeof initial.lastDiscoveryKey === 'string' ? initial.lastDiscoveryKey : null,
    discoveries: Object.freeze(normalizeLabels(initial.discoveries)),
  });
}

export function stepExplorationJournal(previousState, liveState) {
  const previous = createExplorationJournalState(previousState);
  const discovery = liveState?.latestDiscovery;
  const key = discoveryKey(discovery);
  const label = discoveryLabel(discovery);
  const isNewDiscovery = Boolean(key && key !== previous.lastDiscoveryKey && label);
  const discoveries = isNewDiscovery
    ? [label, ...previous.discoveries].slice(0, 5)
    : [...previous.discoveries];

  return Object.freeze({
    state: Object.freeze({
      lastDiscoveryKey: key ?? previous.lastDiscoveryKey,
      discoveries: Object.freeze(discoveries),
    }),
    view: Object.freeze({
      objective: objectiveFor(liveState),
      context: contextFor(liveState),
      discoveries: Object.freeze(discoveries),
      announcement: isNewDiscovery ? label : null,
    }),
  });
}

function normalizeLabels(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'string' && value.trim()).slice(0, 5);
}

function finiteDistance(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function discoveryKey(discovery) {
  if (!discovery || typeof discovery !== 'object') return null;
  const id = discovery.islandId ?? discovery.routeId ?? discovery.landmark?.id ?? discovery.name ?? null;
  if (!id) return null;
  return `${id}:${discovery.discoveredAt ?? ''}`;
}

function discoveryLabel(discovery) {
  if (!discovery || typeof discovery !== 'object') return null;
  if (discovery.landmark?.name) return `Landmark found: ${discovery.landmark.name}`;
  if (discovery.name) return `Discovered ${discovery.name}`;
  if (discovery.routeId) return `Route discovered: ${discovery.routeId}`;
  if (discovery.islandId) return `Island discovered: ${discovery.islandId}`;
  return null;
}

function objectiveFor(state) {
  const route = state?.routeGuidance;
  if (route?.destinationName) return `Cross toward ${route.destinationName}.`;
  const nearest = state?.nearestIsland;
  const discovered = Array.isArray(state?.discovered) ? state.discovered : [];
  if (nearest?.id && !discovered.includes(nearest.id)) return `Survey ${nearest.name ?? nearest.id}.`;
  if (state?.currentRegion?.name) return `Search ${state.currentRegion.name} for another route or landmark.`;
  return 'Fly into the mist and find a landmark.';
}

function contextFor(state) {
  const parts = [];
  if (state?.currentRegion?.name) parts.push(state.currentRegion.name);
  const nearest = state?.nearestIsland;
  const distance = finiteDistance(nearest?.distance);
  if (nearest?.name && distance !== null) parts.push(`${nearest.name} · ${distance}m`);
  const isleCount = Number.isFinite(state?.discoveredCount) ? state.discoveredCount : 0;
  const routeCount = Number.isFinite(state?.discoveredRouteCount) ? state.discoveredRouteCount : 0;
  parts.push(`${isleCount} isles · ${routeCount} routes found`);
  return parts.join(' · ');
}
