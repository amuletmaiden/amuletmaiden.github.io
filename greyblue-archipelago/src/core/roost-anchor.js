const DEFAULT_DWELL_SECONDS = 4;
const MAX_EVENTS = 2048;

function cleanId(value) { return typeof value === 'string' ? value.trim() : ''; }
function finite(value) { return Number.isFinite(value) ? Number(value) : null; }

export function stepRoostDwell(previous = null, { dt = 0, grounded = false, island = null, landingZone = null, discoveredIslandIds = [], position = null } = {}, dwellSeconds = DEFAULT_DWELL_SECONDS) {
  const islandId = cleanId(island?.id);
  const zoneId = cleanId(landingZone?.id);
  const discovered = new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds.map(cleanId).filter(Boolean) : []);
  const radius = finite(landingZone?.radius);
  const x = finite(position?.x); const z = finite(position?.z);
  const zoneX = finite(landingZone?.x); const zoneZ = finite(landingZone?.z);
  const valid = grounded && islandId && zoneId && discovered.has(islandId) && radius != null && radius > 0 && x != null && z != null && zoneX != null && zoneZ != null && Math.hypot(x - zoneX, z - zoneZ) <= radius;
  if (!valid) return Object.freeze({ islandId: null, zoneId: null, seconds: 0, established: false });
  const same = cleanId(previous?.islandId) === islandId && cleanId(previous?.zoneId) === zoneId;
  const seconds = Math.min(Math.max(0, finite(dwellSeconds) ?? DEFAULT_DWELL_SECONDS), (same ? Math.max(0, finite(previous?.seconds) ?? 0) : 0) + Math.max(0, finite(dt) ?? 0));
  return Object.freeze({ islandId, zoneId, seconds, established: seconds >= Math.max(0.1, finite(dwellSeconds) ?? DEFAULT_DWELL_SECONDS) });
}

export function makeRoostEvent(dwell, occurredAt = 0) {
  if (!dwell?.established || !cleanId(dwell.islandId) || !cleanId(dwell.zoneId)) return null;
  return Object.freeze({ kind: 'roost-established', id: cleanId(dwell.zoneId), islandId: cleanId(dwell.islandId), landingZoneId: cleanId(dwell.zoneId), occurredAt: Math.max(0, Math.floor(finite(occurredAt) ?? 0)) });
}

export function recoverLatestRoost({ world, exploration, discoveredIslandIds = [] } = {}) {
  const discovered = new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds.map(cleanId).filter(Boolean) : []);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const islandById = new Map(islands.map((island) => [cleanId(island?.id), island]).filter(([id]) => id));
  const events = Array.isArray(exploration?.events) ? exploration.events.slice(0, MAX_EVENTS) : [];
  const candidates = [];
  for (const event of events) {
    if (cleanId(event?.kind) !== 'roost-established') continue;
    const islandId = cleanId(event?.islandId);
    const zoneId = cleanId(event?.landingZoneId || event?.id);
    if (!islandId || !zoneId || !discovered.has(islandId)) continue;
    const island = islandById.get(islandId);
    const zone = Array.isArray(island?.landingZones) ? island.landingZones.find((entry) => cleanId(entry?.id) === zoneId) : null;
    if (!zone) continue;
    const x = finite(zone.x); const y = finite(zone.y); const z = finite(zone.z); const heading = finite(zone.heading);
    if (x == null || y == null || z == null) continue;
    candidates.push({ occurredAt: Math.max(0, finite(event?.occurredAt) ?? 0), islandId, zoneId, position: { x, y: y + 6, z }, heading: heading ?? 0 });
  }
  candidates.sort((a, b) => b.occurredAt - a.occurredAt || b.zoneId.localeCompare(a.zoneId));
  const latest = candidates[0];
  return latest ? Object.freeze({ islandId: latest.islandId, zoneId: latest.zoneId, position: Object.freeze(latest.position), heading: latest.heading }) : null;
}