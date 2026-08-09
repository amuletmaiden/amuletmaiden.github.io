const ATMOSPHERE_CLASSES = Object.freeze(['hush', 'stone', 'glass', 'current', 'warmth', 'chorus']);
const REGION_ATMOSPHERE = Object.freeze({
  'hushed-reach': 'hush',
  'drowned-crown': 'stone',
  'blueglass-wake': 'glass',
  'widow-current': 'current',
  mothwater: 'warmth',
  'far-choir': 'chorus',
});
const STAGES = Object.freeze(['hint', 'gathering', 'near']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  const source = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return new Set(source.map(cleanId).filter(Boolean));
}

function clamp01(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
}

function inactive() {
  return Object.freeze({ active: false, atmosphereClass: null, stage: null });
}

function stageFor(progress) {
  if (progress < 0.28) return 'hint';
  if (progress < 0.68) return 'gathering';
  return 'near';
}

function routeLookup(world, routeId) {
  if (!routeId || !Array.isArray(world?.routes)) return null;
  return world.routes.find((route) => cleanId(route?.id) === routeId) ?? null;
}

function islandLookup(world, islandId) {
  if (!islandId || !Array.isArray(world?.islands)) return null;
  return world.islands.find((island) => cleanId(island?.id) === islandId) ?? null;
}

export function deriveKnownCrossingDestinationAtmosphere({
  world,
  activeRouteId,
  destinationIslandId,
  discoveredRouteIds,
  discoveredIslandIds,
  familiarCrossing,
  crossingProgress,
  recoveryActive = false,
} = {}) {
  if (recoveryActive || familiarCrossing?.active !== true || familiarCrossing?.familiar !== true) return inactive();
  const routeId = cleanId(activeRouteId);
  const destinationId = cleanId(destinationIslandId);
  if (!routeId || !destinationId) return inactive();

  const discoveredRoutes = idSet(discoveredRouteIds);
  const discoveredIslands = idSet(discoveredIslandIds);
  if (!discoveredRoutes.has(routeId)) return inactive();

  const route = routeLookup(world, routeId);
  if (!route) return inactive();
  const fromId = cleanId(route.fromIslandId);
  const toId = cleanId(route.toIslandId);
  if (!fromId || !toId || !discoveredIslands.has(fromId) || !discoveredIslands.has(toId)) return inactive();
  if (destinationId !== fromId && destinationId !== toId) return inactive();

  const destination = islandLookup(world, destinationId);
  if (!destination || cleanId(destination.id) !== destinationId) return inactive();
  const regionId = cleanId(destination.regionId);
  const atmosphereClass = REGION_ATMOSPHERE[regionId] ?? null;
  if (!atmosphereClass) return inactive();

  const progress = clamp01(crossingProgress);
  if (progress === null || progress <= 0 || progress >= 1) return inactive();
  return Object.freeze({ active: true, atmosphereClass, stage: stageFor(progress) });
}

export function knownCrossingDestinationAtmospherePublicState(result) {
  const atmosphereClass = ATMOSPHERE_CLASSES.includes(result?.atmosphereClass) ? result.atmosphereClass : null;
  const stage = STAGES.includes(result?.stage) ? result.stage : null;
  return Object.freeze({
    active: Boolean(result?.active && atmosphereClass && stage),
    atmosphereClass: result?.active && atmosphereClass ? atmosphereClass : null,
    stage: result?.active && stage ? stage : null,
  });
}

export function knownCrossingDestinationMistMultiplier(result) {
  if (!result?.active) return 1;
  const classBias = Object.freeze({ hush: 0.01, stone: 0.025, glass: -0.025, current: 0.015, warmth: -0.012, chorus: -0.02 });
  const stageWeight = Object.freeze({ hint: 0.34, gathering: 0.67, near: 1 });
  const bias = classBias[result.atmosphereClass];
  const weight = stageWeight[result.stage];
  if (!Number.isFinite(bias) || !Number.isFinite(weight)) return 1;
  return Math.max(0.94, Math.min(1.04, 1 + bias * weight));
}
