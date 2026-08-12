const RESPONSE_CLASSES = new Set(["resonance", "instrument", "relic", "threshold"]);
const INACTIVE = Object.freeze({ active: false, text: null, responseClass: null });

export function deriveLandmarkInvestigationResponse({
  event = null,
  completed = false,
  islands = [],
  discoveredIslandIds = [],
  paused = false,
  recovering = false,
  restoring = false,
  crossing = false,
} = {}) {
  if (completed !== true || paused || recovering || restoring || crossing) return INACTIVE;
  if (!validId(event?.landmarkId) || !validId(event?.regionId) || !Array.isArray(islands)) return INACTIVE;

  const discovered = new Set(normalizeIds(discoveredIslandIds));
  const island = islands.find((candidate) =>
    discovered.has(candidate?.id)
    && candidate?.regionId === event.regionId
    && candidate?.landmarkRecord?.id === event.landmarkId);
  if (!island) return INACTIVE;

  const encounter = island.landmarkRecord?.encounter;
  const text = typeof encounter?.revealText === "string" ? encounter.revealText.trim() : "";
  const responseClass = encounter?.class;
  if (!text || !RESPONSE_CLASSES.has(responseClass)) return INACTIVE;

  return Object.freeze({ active: true, text, responseClass });
}

function normalizeIds(values) {
  if (values instanceof Set) return [...values].filter(validId);
  if (!Array.isArray(values)) return [];
  return values.filter(validId);
}

function validId(value) {
  return typeof value === "string" && value.length > 0;
}
