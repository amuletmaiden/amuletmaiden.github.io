export const KNOWN_LANDMARK_REVISIT_VARIATIONS = Object.freeze(['hush', 'resonance', 'weathering', 'glint']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function encounterClass(value) {
  if (value === 'resonance' || value === 'instrument' || value === 'relic' || value === 'threshold') return value;
  return 'threshold';
}

function atmosphereClass(value) {
  if (value === 'clear' || value === 'mist' || value === 'rain' || value === 'storm' || value === 'cold' || value === 'warm') return value;
  return 'clear';
}

function stableVariation(landmarkId, encounter, atmosphere) {
  let hash = 2166136261;
  const source = `${landmarkId}:${encounter}:${atmosphere}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return KNOWN_LANDMARK_REVISIT_VARIATIONS[hash % KNOWN_LANDMARK_REVISIT_VARIATIONS.length];
}

function inactive() {
  return Object.freeze({ available: false, active: false, variation: null, episode: null });
}

function findKnownLandmark(world, landmarkId, islandId, regionId) {
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  for (const island of islands) {
    const candidateIslandId = cleanId(island?.id);
    const candidateRegionId = cleanId(island?.regionId);
    const record = island?.landmarkRecord;
    const candidateLandmarkId = cleanId(record?.id);
    if (
      candidateLandmarkId === landmarkId
      && candidateIslandId === islandId
      && candidateRegionId === regionId
    ) {
      return {
        encounter: encounterClass(cleanId(record?.encounter?.class)),
      };
    }
  }
  return null;
}

export function deriveKnownLandmarkRevisit({
  world,
  currentRegionId,
  currentIslandId,
  currentLandmarkId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  encounterPresent = false,
  interactionRequested = false,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  currentAtmosphere = 'clear',
  visitEpisodeId,
  previousEpisode,
} = {}) {
  if (recoveryActive || crossingActive || restorePublishing || encounterPresent !== true) return inactive();

  const regionId = cleanId(currentRegionId);
  const islandId = cleanId(currentIslandId);
  const landmarkId = cleanId(currentLandmarkId);
  const episodeId = cleanId(visitEpisodeId);
  if (!regionId || !islandId || !landmarkId || !episodeId) return inactive();

  const landmark = findKnownLandmark(world, landmarkId, islandId, regionId);
  if (!landmark) return inactive();

  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  if (!discovered.has(islandId) || !investigated.has(landmarkId)) return inactive();

  const variation = stableVariation(
    landmarkId,
    landmark.encounter,
    atmosphereClass(cleanId(currentAtmosphere)),
  );

  const previousLandmarkId = cleanId(previousEpisode?.landmarkId);
  const previousEpisodeId = cleanId(previousEpisode?.episodeId);
  const duplicate = previousEpisode?.responded === true
    && previousLandmarkId === landmarkId
    && previousEpisodeId === episodeId;

  const available = !duplicate;
  const active = available && interactionRequested === true;

  return Object.freeze({
    available,
    active,
    variation: available ? variation : null,
    episode: Object.freeze({
      landmarkId,
      episodeId,
      responded: Boolean(duplicate || active),
    }),
  });
}

export function knownLandmarkRevisitPublicState(result) {
  const variation = KNOWN_LANDMARK_REVISIT_VARIATIONS.includes(result?.variation) ? result.variation : null;
  return Object.freeze({
    available: Boolean(result?.available && variation),
    active: Boolean(result?.active && variation),
    variation: variation && result?.available ? variation : null,
  });
}
