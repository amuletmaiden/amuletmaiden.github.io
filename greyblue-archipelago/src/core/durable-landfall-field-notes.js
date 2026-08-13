const MAX_FIELD_NOTES = 5;

export function deriveDurableLandfallFieldNotes({
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
} = {}) {
  const context = buildContext(islands, discoveredIslandIds);
  return deriveNotes(explorationEvents, context, { includeLandmarks: false });
}

export function deriveDurableExplorationFieldNotes({
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
} = {}) {
  const context = buildContext(islands, discoveredIslandIds);
  return deriveNotes(explorationEvents, context, { includeLandmarks: true });
}

function buildContext(islands, discoveredIslandIds) {
  const discovered = new Set(normalizeIds(discoveredIslandIds));
  const landfalls = new Map();
  const landmarks = new Map();

  for (const island of Array.isArray(islands) ? islands : []) {
    if (!validId(island?.id) || !validId(island?.regionId) || !discovered.has(island.id)) continue;

    if (validText(island?.name)) {
      landfalls.set(island.id, Object.freeze({
        regionId: island.regionId,
        name: cleanText(island.name, 120),
      }));
    }

    const landmark = island?.landmarkRecord;
    const encounter = landmark?.encounter;
    if (!validId(landmark?.id) || !validText(landmark?.title) || !validText(encounter?.revealText)) continue;
    landmarks.set(landmark.id, Object.freeze({
      regionId: island.regionId,
      title: cleanText(landmark.title, 120),
      revealText: cleanText(encounter.revealText, 180),
    }));
  }

  return Object.freeze({ landfalls, landmarks });
}

function deriveNotes(explorationEvents, context, { includeLandmarks }) {
  const notes = [];
  const seenLandfalls = new Set();
  const seenLandmarks = new Set();
  const events = Array.isArray(explorationEvents) ? explorationEvents : [];

  for (let index = events.length - 1; index >= 0 && notes.length < MAX_FIELD_NOTES; index -= 1) {
    const event = events[index];

    if (event?.kind === "island-landed" && validId(event.islandId) && validId(event.regionId)) {
      if (seenLandfalls.has(event.islandId)) continue;
      const candidate = context.landfalls.get(event.islandId);
      if (!candidate || candidate.regionId !== event.regionId) continue;
      seenLandfalls.add(event.islandId);
      notes.push(`Landed: ${candidate.name}`);
      continue;
    }

    if (!includeLandmarks
      || event?.kind !== "landmark-investigated"
      || !validId(event.landmarkId)
      || !validId(event.regionId)
      || seenLandmarks.has(event.landmarkId)) {
      continue;
    }

    const candidate = context.landmarks.get(event.landmarkId);
    if (!candidate || candidate.regionId !== event.regionId) continue;
    seenLandmarks.add(event.landmarkId);
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
