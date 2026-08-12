const MAX_FIELD_NOTES = 5;

export function deriveDurableLandmarkFieldNotes({
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
} = {}) {
  const discovered = new Set(normalizeIds(discoveredIslandIds));
  const candidates = new Map();

  for (const island of Array.isArray(islands) ? islands : []) {
    const landmark = island?.landmarkRecord;
    const encounter = landmark?.encounter;
    if (!discovered.has(island?.id)) continue;
    if (!validId(island?.id) || !validId(island?.regionId) || !validId(landmark?.id)) continue;
    if (!validText(landmark?.title) || !validText(encounter?.revealText)) continue;
    candidates.set(landmark.id, Object.freeze({
      islandId: island.id,
      regionId: island.regionId,
      title: cleanText(landmark.title, 120),
      revealText: cleanText(encounter.revealText, 180),
    }));
  }

  const notes = [];
  const seen = new Set();
  const events = Array.isArray(explorationEvents) ? explorationEvents : [];
  for (let index = events.length - 1; index >= 0 && notes.length < MAX_FIELD_NOTES; index -= 1) {
    const event = events[index];
    if (event?.kind !== "landmark-investigated" || !validId(event.landmarkId) || !validId(event.regionId)) continue;
    if (seen.has(event.landmarkId)) continue;
    const candidate = candidates.get(event.landmarkId);
    if (!candidate || candidate.regionId !== event.regionId) continue;
    seen.add(event.landmarkId);
    notes.push(`Investigated: ${candidate.title} — ${candidate.revealText}`);
  }

  return Object.freeze(notes);
}

function normalizeIds(values) {
  if (values instanceof Set) return [...values].filter(validId);
  if (!Array.isArray(values)) return [];
  return values.filter(validId);
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function validText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanText(value, limit) {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}
