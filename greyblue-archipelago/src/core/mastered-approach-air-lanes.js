const LANE_CLASSES = Object.freeze(['faint', 'clear', 'final']);
const MAX_NEAR_DISTANCE = 1800;
const TRACE_COUNT = 5;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function normalizeCorridor(corridor) {
  const id = cleanId(corridor?.id);
  const entry = point(corridor?.entry);
  const touchdown = point(corridor?.touchdown);
  if (!id || !entry || !touchdown) return null;
  const dx = touchdown.x - entry.x;
  const dy = touchdown.y - entry.y;
  const dz = touchdown.z - entry.z;
  const horizontalLength = Math.hypot(dx, dz);
  if (!Number.isFinite(horizontalLength) || horizontalLength < 40) return null;
  return Object.freeze({ id, entry, touchdown, dx, dy, dz, horizontalLength });
}

function sampleTrace(corridor) {
  const points = [];
  for (let index = 0; index < TRACE_COUNT; index += 1) {
    const t = index / (TRACE_COUNT - 1);
    points.push(Object.freeze({
      x: corridor.entry.x + corridor.dx * t,
      y: corridor.entry.y + corridor.dy * t,
      z: corridor.entry.z + corridor.dz * t,
    }));
  }
  return Object.freeze(points);
}

function distanceToSegment2D(position, corridor) {
  const px = position.x - corridor.entry.x;
  const pz = position.z - corridor.entry.z;
  const denom = corridor.horizontalLength * corridor.horizontalLength;
  const t = Math.max(0, Math.min(1, (px * corridor.dx + pz * corridor.dz) / denom));
  const x = corridor.entry.x + corridor.dx * t;
  const z = corridor.entry.z + corridor.dz * t;
  return Math.hypot(position.x - x, position.z - z);
}

function laneClassFor(position, corridor) {
  const touchdownDistance = Math.hypot(position.x - corridor.touchdown.x, position.z - corridor.touchdown.z);
  if (touchdownDistance <= 360) return 'final';
  const laneDistance = distanceToSegment2D(position, corridor);
  if (laneDistance <= 520 || touchdownDistance <= 900) return 'clear';
  return 'faint';
}

export function deriveMasteredApproachAirLanes({
  world,
  currentRegionId,
  discoveredIslandIds,
  masteredCorridorIds,
  position,
  airborne = true,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  highContrast = false,
  reducedMotion = false,
} = {}) {
  const regionId = cleanId(currentRegionId);
  const dragon = point(position);
  if (!regionId || !dragon || airborne !== true || recoveryActive || crossingActive || restorePublishing) {
    return Object.freeze({ active: false, laneClass: null, lanes: Object.freeze([]) });
  }

  const discovered = idSet(discoveredIslandIds);
  const mastered = idSet(masteredCorridorIds);
  if (!discovered.size || !mastered.size) return Object.freeze({ active: false, laneClass: null, lanes: Object.freeze([]) });

  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const lanes = [];
  for (const island of islands) {
    const islandId = cleanId(island?.id);
    if (!islandId || !discovered.has(islandId) || cleanId(island?.regionId) !== regionId) continue;
    const corridors = Array.isArray(island?.approachCorridors) ? island.approachCorridors : [];
    for (const candidate of corridors) {
      const corridor = normalizeCorridor(candidate);
      if (!corridor || !mastered.has(corridor.id)) continue;
      const nearDistance = Math.min(
        Math.hypot(dragon.x - corridor.entry.x, dragon.z - corridor.entry.z),
        Math.hypot(dragon.x - corridor.touchdown.x, dragon.z - corridor.touchdown.z),
        distanceToSegment2D(dragon, corridor),
      );
      if (nearDistance > MAX_NEAR_DISTANCE) continue;
      let laneClass = laneClassFor(dragon, corridor);
      if (highContrast === true && laneClass === 'faint') laneClass = 'clear';
      lanes.push(Object.freeze({
        islandId,
        corridorId: corridor.id,
        laneClass,
        trace: sampleTrace(corridor),
        reducedMotion: reducedMotion === true,
        nearDistance,
      }));
    }
  }

  lanes.sort((left, right) => left.nearDistance - right.nearDistance || left.corridorId.localeCompare(right.corridorId));
  const bounded = Object.freeze(lanes.slice(0, 3));
  return Object.freeze({ active: bounded.length > 0, laneClass: bounded[0]?.laneClass ?? null, lanes: bounded });
}

export function masteredApproachAirLanePresentationPolicy(laneClass, { highContrast = false } = {}) {
  const normalized = LANE_CLASSES.includes(laneClass) ? laneClass : 'faint';
  const baseOpacity = normalized === 'final' ? 0.42 : normalized === 'clear' ? 0.29 : 0.16;
  return Object.freeze({
    laneClass: normalized,
    opacity: Math.min(0.56, baseOpacity * (highContrast === true ? 1.3 : 1)),
    depthTest: true,
    depthWrite: false,
    fog: true,
    xray: false,
  });
}

export function masteredApproachAirLanePublicState(result) {
  const laneClass = LANE_CLASSES.includes(result?.laneClass) ? result.laneClass : null;
  return Object.freeze({ active: Boolean(result?.active && laneClass), laneClass });
}
