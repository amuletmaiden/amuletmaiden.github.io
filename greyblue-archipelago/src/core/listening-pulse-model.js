const TAU = Math.PI * 2;
const DEFAULT_RANGE = 3400;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function normalizeDiscovered(values) {
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
}

function signalStrength(island, distance, range) {
  const distanceStrength = clamp(1 - distance / Math.max(1, range), 0, 1);
  const landmarkLift = island?.landmark ? 0.28 : 0;
  return clamp(distanceStrength + landmarkLift, 0, 1);
}

function turnFor(error) {
  const magnitude = Math.abs(error);
  if (magnitude < 0.14) return 'ahead';
  if (magnitude > Math.PI - 0.32) return 'behind';
  return error > 0 ? 'right' : 'left';
}

export function selectListeningSignal({ world, position, yaw, discovered, maxRange = DEFAULT_RANGE } = {}) {
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const known = normalizeDiscovered(discovered);
  const origin = {
    x: finite(position?.x),
    z: finite(position?.z),
  };
  const heading = finite(yaw);
  const range = clamp(finite(maxRange, DEFAULT_RANGE), 600, 8000);
  let best = null;

  for (const island of islands) {
    if (!island || typeof island.id !== 'string' || known.has(island.id)) continue;
    const x = finite(island.x, Number.NaN);
    const z = finite(island.z, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const dx = x - origin.x;
    const dz = z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance) || distance < 120 || distance > range) continue;

    const strength = signalStrength(island, distance, range);
    const score = distance / (island.landmark ? 1.24 : 1);
    if (!best || score < best.score || (score === best.score && island.id.localeCompare(best.island.id) < 0)) {
      best = { island, dx, dz, distance, strength, score };
    }
  }

  if (!best) {
    return Object.freeze({
      found: false,
      range,
      message: 'Only open mist answers.',
    });
  }

  const bearing = Math.atan2(best.dx, best.dz);
  const headingError = normalizeAngle(bearing - heading);
  const turn = turnFor(headingError);
  const landmarkSignal = Boolean(best.island.landmark);
  const intensity = best.strength >= 0.68 ? 'clear' : best.strength >= 0.38 ? 'faint' : 'distant';

  return Object.freeze({
    found: true,
    islandId: best.island.id,
    regionId: typeof best.island.regionId === 'string' ? best.island.regionId : null,
    distance: Math.round(best.distance),
    bearing: ((bearing % TAU) + TAU) % TAU,
    headingError,
    turn,
    intensity,
    landmarkSignal,
    range,
    message: `${landmarkSignal ? 'A stronger echo' : 'An echo'} answers ${turn}.`,
  });
}
