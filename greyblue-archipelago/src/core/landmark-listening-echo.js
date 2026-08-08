const TAU = Math.PI * 2;
const DEFAULT_RANGE = 3000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function turnFor(error) {
  const magnitude = Math.abs(error);
  if (magnitude < 0.14) return 'ahead';
  if (magnitude > Math.PI - 0.32) return 'behind';
  return error > 0 ? 'right' : 'left';
}

function distanceBand(distance, range) {
  const ratio = distance / Math.max(1, range);
  if (ratio <= 0.28) return 'near';
  if (ratio <= 0.62) return 'through the mist';
  return 'far';
}

export function selectAwakenedLandmarkEcho({
  world,
  position,
  yaw,
  discoveredIslandIds,
  investigatedLandmarkIds,
  maxRange = DEFAULT_RANGE,
} = {}) {
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const origin = { x: finite(position?.x), z: finite(position?.z) };
  const heading = finite(yaw);
  const range = clamp(finite(maxRange, DEFAULT_RANGE), 600, 6000);
  let best = null;

  for (const island of islands) {
    const islandId = cleanId(island?.id);
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    if (!islandId || !landmarkId) continue;
    if (!discovered.has(islandId) || !investigated.has(landmarkId)) continue;

    const x = finite(island?.x, Number.NaN);
    const z = finite(island?.z, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const dx = x - origin.x;
    const dz = z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance) || distance < 100 || distance > range) continue;

    if (!best || distance < best.distance || (distance === best.distance && landmarkId.localeCompare(best.landmarkId) < 0)) {
      best = { islandId, landmarkId, regionId: cleanId(island?.regionId), dx, dz, distance };
    }
  }

  if (!best) {
    return Object.freeze({ found: false, range, reason: 'no-awakened-landmark' });
  }

  const bearing = Math.atan2(best.dx, best.dz);
  const headingError = normalizeAngle(bearing - heading);
  return Object.freeze({
    found: true,
    islandId: best.islandId,
    landmarkId: best.landmarkId,
    regionId: best.regionId,
    distance: Math.round(best.distance),
    distanceBand: distanceBand(best.distance, range),
    bearing: ((bearing % TAU) + TAU) % TAU,
    headingError,
    turn: turnFor(headingError),
    range,
    soundHook: 'landmark-resonance-echo',
  });
}

export function shouldPreferAwakenedEcho(echo, unknownSignal) {
  if (!echo?.found) return false;
  if (!unknownSignal?.found) return true;
  const echoDistance = finite(echo.distance, Number.POSITIVE_INFINITY);
  const unknownDistance = finite(unknownSignal.distance, Number.POSITIVE_INFINITY);
  return echoDistance <= unknownDistance * 0.72;
}
