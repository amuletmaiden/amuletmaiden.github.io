const MIN_SPEED = 24;
const DEFAULT_RADIUS = 90;
const MAX_RADIUS = 420;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function cleanId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeLandmark(raw) {
  const id = cleanId(raw?.id);
  const islandId = cleanId(raw?.islandId);
  const regionId = cleanId(raw?.regionId);
  const x = Number(raw?.x);
  const z = Number(raw?.z);
  if (!id || !islandId || !regionId || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (raw?.discovered !== true || raw?.investigated !== true) return null;
  const radius = Math.max(24, Math.min(MAX_RADIUS, finite(Number(raw?.radius), DEFAULT_RADIUS)));
  const encounterClass = cleanId(raw?.encounterClass) || 'resonance';
  return Object.freeze({ id, islandId, regionId, x, z, radius, encounterClass });
}

function sanitizeState(raw) {
  const landmarkId = cleanId(raw?.landmarkId);
  const phase = ['idle', 'armed', 'inside'].includes(raw?.phase) ? raw.phase : 'idle';
  return Object.freeze({ landmarkId, phase });
}

function distanceTo(landmark, position) {
  const x = finite(Number(position?.x));
  const z = finite(Number(position?.z));
  return Math.hypot(x - landmark.x, z - landmark.z);
}

export function stepLandmarkFlightEncounter({
  landmarks = [],
  position = null,
  speed = 0,
  recovered = false,
  state = null,
} = {}) {
  const previous = sanitizeState(state);
  const eligible = (Array.isArray(landmarks) ? landmarks : [])
    .map(sanitizeLandmark)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const ranked = eligible
    .map((landmark) => ({ landmark, distance: distanceTo(landmark, position) }))
    .sort((a, b) => a.distance - b.distance || a.landmark.id.localeCompare(b.landmark.id));
  const nearest = ranked[0] ?? null;

  if (recovered === true) {
    return Object.freeze({
      state: Object.freeze({ landmarkId: '', phase: 'idle' }),
      event: null,
      active: null,
    });
  }
  if (!nearest) {
    return Object.freeze({
      state: Object.freeze({ landmarkId: '', phase: 'idle' }),
      event: null,
      active: null,
    });
  }

  const { landmark, distance } = nearest;
  const inside = distance <= landmark.radius;
  const fastEnough = Math.max(0, finite(Number(speed))) >= MIN_SPEED;
  let next = previous;
  let event = null;

  if (previous.landmarkId !== landmark.id) {
    next = Object.freeze({ landmarkId: landmark.id, phase: inside ? 'idle' : 'armed' });
  } else if (previous.phase === 'idle' && !inside) {
    next = Object.freeze({ landmarkId: landmark.id, phase: 'armed' });
  } else if (previous.phase === 'armed' && inside) {
    next = Object.freeze({ landmarkId: landmark.id, phase: fastEnough ? 'inside' : 'armed' });
  } else if (previous.phase === 'inside' && !inside) {
    if (fastEnough) {
      event = Object.freeze({
        kind: 'landmark-flight-encounter',
        landmarkId: landmark.id,
        islandId: landmark.islandId,
        regionId: landmark.regionId,
        encounterClass: landmark.encounterClass,
      });
    }
    next = Object.freeze({ landmarkId: landmark.id, phase: 'armed' });
  }

  return Object.freeze({
    state: next,
    event,
    active: Object.freeze({
      landmarkId: landmark.id,
      encounterClass: landmark.encounterClass,
      phase: next.phase,
      inside,
    }),
  });
}

export function isCompletedLandmarkFlightEncounter(events, landmarkId) {
  const id = cleanId(landmarkId);
  if (!id || !Array.isArray(events)) return false;
  return events.some((event) => event?.kind === 'landmark-flight-encounter' && cleanId(event?.landmarkId) === id);
}

export const landmarkFlightEncounterInternals = Object.freeze({
  MIN_SPEED,
  DEFAULT_RADIUS,
  MAX_RADIUS,
  sanitizeLandmark,
  sanitizeState,
});
