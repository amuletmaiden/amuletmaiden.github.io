const MAX_FIELD_NOTES = 5;

export function deriveDurableLandfallFieldNotes({
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
} = {}) {
  const discovered = new Set(normalizeIds(discoveredIslandIds));
  const candidates = new Map();

  for (const island of Array.isArray(islands) ? islands : []) {
    if (!validId(island?.id) || !validId(island?.regionId)) continue;
    if (!discovered.has(island.id) || !validText(island?.name)) continue;
    candidates.set(island.id, Object.freeze({
      regionId: island.regionId,
      name: cleanText(island.name, 120),
    }));
  }

  const notes = [];
  const seen = new Set();
  const events = Array.isArray(explorationEvents) ? explorationEvents : [];
  for (let index = events.length - 1; index >= 0 && notes.length < MAX_FIELD_NOTES; index -= 1) {
    const event = events[index];
    if (event?.kind !== "island-landed" || !validId(event.islandId) || !validId(event.regionId)) continue;
    if (seen.has(event.islandId)) continue;
    const candidate = candidates.get(event.islandId);
    if (!candidate || candidate.regionId !== event.regionId) continue;
    seen.add(event.islandId);
    notes.push(`Landed: ${candidate.name}`);
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
