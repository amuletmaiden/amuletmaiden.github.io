const MAX_EVENTS = 512;
const MAX_PUBLIC_LANDMARKS = 8;

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function investigatedIds(exploration) {
  const events = Array.isArray(exploration?.events) ? exploration.events.slice(0, MAX_EVENTS) : [];
  const ids = new Set();
  for (const event of events) {
    if (cleanId(event?.kind) !== "landmark-investigated") continue;
    const id = cleanId(event?.landmarkId || event?.id);
    if (id) ids.add(id);
  }
  return ids;
}

function toneFor(classes) {
  const unique = [...new Set(classes)].sort();
  if (unique.length === 1) {
    if (unique[0] === "resonance") return Object.freeze({ id: "answering-air", text: "The mist carries a second answer between the known stones.", soundHook: "omen-answering-air" });
    if (unique[0] === "instrument") return Object.freeze({ id: "measured-weather", text: "For a moment, the weather seems measured by the instruments already found.", soundHook: "omen-measured-weather" });
    if (unique[0] === "relic") return Object.freeze({ id: "shared-silence", text: "The old places seem to share one silence now.", soundHook: "omen-shared-silence" });
    if (unique[0] === "threshold") return Object.freeze({ id: "same-door", text: "The thresholds already crossed begin to feel like parts of the same door.", soundHook: "omen-same-door" });
  }
  return Object.freeze({ id: "confluence", text: "What answered before is answering together now.", soundHook: "omen-confluence" });
}

export function evaluateRegionalOmenChain({ world, exploration, currentRegionId = null, discoveredIslandIds = [] } = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId) return Object.freeze({ active: false, regionId: null, tone: null, landmarkIds: Object.freeze([]) });

  const region = Array.isArray(world?.regions) ? world.regions.find((candidate) => cleanId(candidate?.id) === regionId) : null;
  if (!region) return Object.freeze({ active: false, regionId, tone: null, landmarkIds: Object.freeze([]) });

  const discovered = new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds.map(cleanId).filter(Boolean) : []);
  const investigated = investigatedIds(exploration);
  const matches = [];
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  for (const island of islands) {
    const islandId = cleanId(island?.id);
    if (!islandId || !discovered.has(islandId) || cleanId(island?.regionId) !== regionId) continue;
    const landmark = island?.landmarkRecord;
    const landmarkId = cleanId(landmark?.id);
    if (!landmarkId || !investigated.has(landmarkId)) continue;
    matches.push({ id: landmarkId, encounterClass: cleanId(landmark?.encounter?.class) || "threshold" });
  }

  matches.sort((a, b) => a.id.localeCompare(b.id));
  if (matches.length < 2) return Object.freeze({ active: false, regionId, tone: null, landmarkIds: Object.freeze([]) });

  const tone = toneFor(matches.map((match) => match.encounterClass));
  return Object.freeze({ active: true, regionId, tone, landmarkIds: Object.freeze(matches.slice(0, MAX_PUBLIC_LANDMARKS).map((match) => match.id)) });
}