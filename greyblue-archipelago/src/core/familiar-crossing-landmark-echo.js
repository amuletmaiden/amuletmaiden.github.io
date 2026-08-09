const ECHO_CLASSES = Object.freeze(['resonance', 'instrument', 'relic', 'threshold']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function inactive(reason = 'inactive') {
  return Object.freeze({
    active: false,
    echoClass: null,
    islandId: null,
    landmarkId: null,
    reason,
  });
}

function echoClassFor(landmark) {
  const candidate = cleanId(landmark?.encounter?.class);
  return ECHO_CLASSES.includes(candidate) ? candidate : 'threshold';
}

function routeRegions(route, islandById, discoveredIslandIds) {
  const fromIslandId = cleanId(route?.fromIslandId);
  const toIslandId = cleanId(route?.toIslandId);
  if (!fromIslandId || !toIslandId) return null;
  if (!discoveredIslandIds.has(fromIslandId) || !discoveredIslandIds.has(toIslandId)) return null;
  const from = islandById.get(fromIslandId);
  const to = islandById.get(toIslandId);
  if (!from || !to) return null;
  const regions = new Set([cleanId(from.regionId), cleanId(to.regionId)].filter(Boolean));
  return regions.size ? regions : null;
}

export function selectFamiliarCrossingLandmarkEcho({
  world,
  activeRouteId,
  familiarCrossing,
  listenRequested = false,
  recoveryActive = false,
  discoveredRouteIds,
  discoveredIslandIds,
  investigatedLandmarkIds,
  heardLandmarkIds,
} = {}) {
  if (!listenRequested) return inactive('listen-required');
  if (recoveryActive) return inactive('recovery');
  if (!familiarCrossing?.active || !familiarCrossing?.familiar) return inactive('not-familiar-crossing');

  const routeId = cleanId(activeRouteId);
  if (!routeId) return inactive('invalid-route');
  const discoveredRoutes = idSet(discoveredRouteIds);
  if (!discoveredRoutes.has(routeId)) return inactive('undiscovered-route');

  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const route = routes.find((candidate) => cleanId(candidate?.id) === routeId);
  if (!route) return inactive('unknown-route');

  const discoveredIslands = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const heard = idSet(heardLandmarkIds);
  const islandById = new Map(islands.map((island) => [cleanId(island?.id), island]).filter(([id]) => Boolean(id)));
  const eligibleRegions = routeRegions(route, islandById, discoveredIslands);
  if (!eligibleRegions) return inactive('route-endpoints-not-known');

  const candidates = [];
  for (const island of islands) {
    const islandId = cleanId(island?.id);
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    const regionId = cleanId(island?.regionId);
    if (!islandId || !landmarkId || !regionId) continue;
    if (!eligibleRegions.has(regionId)) continue;
    if (!discoveredIslands.has(islandId) || !investigated.has(landmarkId) || heard.has(landmarkId)) continue;
    candidates.push({ islandId, landmarkId, echoClass: echoClassFor(island.landmarkRecord) });
  }

  candidates.sort((a, b) => a.landmarkId.localeCompare(b.landmarkId) || a.islandId.localeCompare(b.islandId));
  const selected = candidates[0];
  if (!selected) return inactive('no-known-investigated-landmark');
  return Object.freeze({ active: true, ...selected, reason: 'known-landmark-echo' });
}

export function familiarCrossingLandmarkEchoPublicState(result) {
  const echoClass = ECHO_CLASSES.includes(result?.echoClass) ? result.echoClass : null;
  return Object.freeze({
    active: Boolean(result?.active && echoClass),
    echoClass: result?.active && echoClass ? echoClass : null,
  });
}

export function familiarCrossingLandmarkEchoLine(echoClass) {
  const lines = Object.freeze({
    resonance: 'A remembered resonance carries across the familiar way.',
    instrument: 'Something once studied answers through the weather.',
    relic: 'A known relic leaves a faint answer in the mist.',
    threshold: 'A remembered threshold answers once, then falls quiet.',
  });
  return lines[echoClass] ?? null;
}
