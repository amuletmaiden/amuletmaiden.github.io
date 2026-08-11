const MAX_NODES = 96;
const MAX_EDGES = 192;
const PADDING = 0.08;
const SPAN = 1 - PADDING * 2;

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function uniqueIds(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = cleanId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizedEvents(exploration) {
  return Array.isArray(exploration?.events)
    ? exploration.events.filter((event) => event && typeof event === 'object')
    : [];
}

function completedRouteIds(exploration) {
  return uniqueIds(normalizedEvents(exploration)
    .filter((event) => event.kind === 'route-completed')
    .map((event) => event.routeId || event.id));
}

function roostIslandIds(exploration) {
  return uniqueIds(normalizedEvents(exploration)
    .filter((event) => event.kind === 'roost-established')
    .map((event) => event.islandId));
}

function investigatedLandmarkIds(exploration) {
  return new Set(uniqueIds(normalizedEvents(exploration)
    .filter((event) => event.kind === 'landmark-investigated')
    .map((event) => event.landmarkId || event.id)));
}

function finitePoint(island) {
  return Number.isFinite(island?.x) && Number.isFinite(island?.z)
    ? { x: island.x, z: island.z }
    : null;
}

function chartLayout(islands) {
  const points = islands.map((island) => finitePoint(island));
  const finite = points.filter(Boolean);
  if (!finite.length) return new Map();
  const minX = Math.min(...finite.map((point) => point.x));
  const maxX = Math.max(...finite.map((point) => point.x));
  const minZ = Math.min(...finite.map((point) => point.z));
  const maxZ = Math.max(...finite.map((point) => point.z));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxZ - minZ);
  const scale = Math.min(SPAN / width, SPAN / height);
  const usedWidth = width * scale;
  const usedHeight = height * scale;
  const offsetX = (1 - usedWidth) * 0.5;
  const offsetY = (1 - usedHeight) * 0.5;
  const layout = new Map();
  for (let index = 0; index < islands.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    layout.set(islands[index].id, Object.freeze({
      x: Number((offsetX + (point.x - minX) * scale).toFixed(4)),
      y: Number((offsetY + (point.z - minZ) * scale).toFixed(4)),
    }));
  }
  return layout;
}

function regionName(world, regionId) {
  const region = (Array.isArray(world?.regions) ? world.regions : []).find((candidate) => candidate?.id === regionId);
  return typeof region?.name === 'string' && region.name.trim() ? region.name.trim().slice(0, 120) : '';
}

function stableNodeSort(left, right) {
  return String(left.regionName).localeCompare(String(right.regionName))
    || String(left.name).localeCompare(String(right.name))
    || String(left.id).localeCompare(String(right.id));
}

export function buildKnownVoyageChart({
  world = null,
  discoveredIslandIds = [],
  discoveredRouteIds = [],
  exploration = null,
  currentRegionId = null,
} = {}) {
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const discovered = new Set(uniqueIds(discoveredIslandIds));
  const completedRoutes = new Set(completedRouteIds(exploration));
  const familiarRoutes = new Set([
    ...uniqueIds(discoveredRouteIds),
    ...completedRoutes,
  ]);
  const roosts = new Set(roostIslandIds(exploration));
  const investigated = investigatedLandmarkIds(exploration);
  const activeRegionId = cleanId(currentRegionId);

  const knownIslands = islands
    .filter((island) => discovered.has(cleanId(island?.id)))
    .filter((island) => finitePoint(island))
    .slice(0, MAX_NODES);
  const knownIds = new Set(knownIslands.map((island) => island.id));
  const layout = chartLayout(knownIslands);

  const nodes = knownIslands.map((island) => {
    const position = layout.get(island.id) ?? { x: 0.5, y: 0.5 };
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    return Object.freeze({
      id: cleanId(island.id),
      name: typeof island?.name === 'string' && island.name.trim() ? island.name.trim().slice(0, 120) : 'Known island',
      regionName: typeof island?.regionName === 'string' && island.regionName.trim()
        ? island.regionName.trim().slice(0, 120)
        : regionName(world, island?.regionId),
      x: position.x,
      y: position.y,
      currentRegion: Boolean(activeRegionId && cleanId(island?.regionId) === activeRegionId),
      roost: roosts.has(cleanId(island.id)),
      investigatedLandmark: Boolean(landmarkId && investigated.has(landmarkId)),
    });
  }).sort(stableNodeSort);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = routes
    .filter((route) => familiarRoutes.has(cleanId(route?.id)))
    .filter((route) => knownIds.has(cleanId(route?.fromIslandId)) && knownIds.has(cleanId(route?.toIslandId)))
    .slice(0, MAX_EDGES)
    .map((route) => Object.freeze({
      id: cleanId(route.id),
      from: cleanId(route.fromIslandId),
      to: cleanId(route.toIslandId),
      kind: route?.kind === 'far-ring' ? 'crossing' : 'passage',
      completed: completedRoutes.has(cleanId(route.id)),
    }))
    .filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to))
    .sort((left, right) => left.id.localeCompare(right.id));

  const text = [];
  for (const node of nodes) {
    const notes = [];
    if (node.currentRegion) notes.push('current region');
    if (node.roost) notes.push('roost');
    if (node.investigatedLandmark) notes.push('landmark investigated');
    text.push(`${node.name}${node.regionName ? ` — ${node.regionName}` : ''}${notes.length ? ` (${notes.join(', ')})` : ''}.`);
  }
  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    text.push(`${from.name} to ${to.name}: ${edge.completed ? 'completed' : 'known'} ${edge.kind}.`);
  }

  return Object.freeze({
    available: nodes.length > 0,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    text: Object.freeze(text),
  });
}
