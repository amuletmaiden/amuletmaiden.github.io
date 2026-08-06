const DEFAULTS = Object.freeze({
  projectionSeconds: 2.5,
  activationDistance: 900,
  warmDistance: 1300,
  retirementDistance: 1700,
  maxActive: 8,
  maxWarm: 16,
  telemetryLimit: 16,
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  const normalized = finite(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function integer(value, fallback, minimum = 0) {
  const normalized = Math.floor(finite(value, fallback));
  return normalized >= minimum ? normalized : fallback;
}

function point(value) {
  return Object.freeze({
    x: finite(value?.x),
    y: finite(value?.y),
    z: finite(value?.z),
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function uniqueIds(value) {
  return Object.freeze([...new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id.length > 0) : [])].sort());
}

function normalizeState(state) {
  return Object.freeze({
    activeIds: uniqueIds(state?.activeIds),
    warmIds: uniqueIds(state?.warmIds),
  });
}

function normalizeConfig(config) {
  const activationDistance = positive(config?.activationDistance, DEFAULTS.activationDistance);
  const warmDistance = Math.max(activationDistance, positive(config?.warmDistance, DEFAULTS.warmDistance));
  const retirementDistance = Math.max(warmDistance, positive(config?.retirementDistance, DEFAULTS.retirementDistance));
  return Object.freeze({
    projectionSeconds: Math.min(8, positive(config?.projectionSeconds, DEFAULTS.projectionSeconds)),
    activationDistance,
    warmDistance,
    retirementDistance,
    maxActive: integer(config?.maxActive, DEFAULTS.maxActive, 1),
    maxWarm: integer(config?.maxWarm, DEFAULTS.maxWarm, 0),
    telemetryLimit: Math.min(64, integer(config?.telemetryLimit, DEFAULTS.telemetryLimit, 1)),
  });
}

function normalizeIslands(islands) {
  if (!Array.isArray(islands)) return Object.freeze([]);
  const seen = new Set();
  const normalized = [];
  for (const island of islands) {
    if (typeof island?.id !== 'string' || island.id.length === 0 || seen.has(island.id)) continue;
    seen.add(island.id);
    normalized.push(Object.freeze({
      id: island.id,
      position: point(island.position),
      radius: Math.max(0, finite(island.radius)),
    }));
  }
  return Object.freeze(normalized);
}

function rankIslands(a, b) {
  return a.projectedDistance - b.projectedDistance
    || a.currentDistance - b.currentDistance
    || a.id.localeCompare(b.id);
}

export function createStreamingResidencyState(initial = {}) {
  return normalizeState(initial);
}

export function planStreamingResidency(input = {}, previousState = {}, config = {}) {
  const settings = normalizeConfig(config);
  const state = normalizeState(previousState);
  const islands = normalizeIslands(input.islands);
  const position = point(input.position);
  const rawVelocity = input.velocity;
  const velocityValid = Number.isFinite(rawVelocity?.x) && Number.isFinite(rawVelocity?.y) && Number.isFinite(rawVelocity?.z);
  const velocity = velocityValid ? point(rawVelocity) : point();
  const projected = Object.freeze({
    x: position.x + velocity.x * settings.projectionSeconds,
    y: position.y + velocity.y * settings.projectionSeconds,
    z: position.z + velocity.z * settings.projectionSeconds,
  });

  const priorActive = new Set(state.activeIds);
  const priorWarm = new Set(state.warmIds);
  const ranked = islands.map((island) => Object.freeze({
    id: island.id,
    currentDistance: Math.max(0, distance(position, island.position) - island.radius),
    projectedDistance: Math.max(0, distance(projected, island.position) - island.radius),
  })).sort(rankIslands);

  const activeCandidates = ranked.filter((entry) =>
    entry.projectedDistance <= settings.activationDistance
    || (priorActive.has(entry.id) && entry.currentDistance <= settings.retirementDistance));
  const selectedActive = activeCandidates.slice(0, settings.maxActive);
  const activeSet = new Set(selectedActive.map((entry) => entry.id));

  const warmCandidates = ranked.filter((entry) => !activeSet.has(entry.id) && (
    entry.projectedDistance <= settings.warmDistance
    || entry.currentDistance <= settings.warmDistance
    || ((priorActive.has(entry.id) || priorWarm.has(entry.id)) && entry.currentDistance <= settings.retirementDistance)
  ));
  const selectedWarm = warmCandidates.slice(0, settings.maxWarm);

  const activeIds = Object.freeze(selectedActive.map((entry) => entry.id));
  const warmIds = Object.freeze(selectedWarm.map((entry) => entry.id));
  const resident = new Set([...activeIds, ...warmIds]);
  const previousResident = new Set([...state.activeIds, ...state.warmIds]);
  const activatedIds = Object.freeze(activeIds.filter((id) => !priorActive.has(id)).slice(0, settings.telemetryLimit));
  const retiredIds = Object.freeze([...previousResident].filter((id) => !resident.has(id)).sort().slice(0, settings.telemetryLimit));

  return Object.freeze({
    state: Object.freeze({ activeIds, warmIds }),
    projection: Object.freeze({ position: projected, seconds: settings.projectionSeconds, fallbackUsed: !velocityValid }),
    telemetry: Object.freeze({
      activatedIds,
      retiredIds,
      activeCount: activeIds.length,
      warmCount: warmIds.length,
      activeBudgetPressure: Math.max(0, activeCandidates.length - settings.maxActive),
      warmBudgetPressure: Math.max(0, warmCandidates.length - settings.maxWarm),
      islandCount: islands.length,
    }),
  });
}
