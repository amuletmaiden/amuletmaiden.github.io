const THREAD_CLASSES = Object.freeze(['chorus', 'instrument', 'relic', 'threshold']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function recognizedRegionSet(exploration) {
  const events = Array.isArray(exploration?.events) ? exploration.events : [];
  const recognized = new Set();
  for (const event of events) {
    if (event?.kind !== 'regional-thread-recognized') continue;
    const regionId = cleanId(event?.regionId);
    if (regionId) recognized.add(regionId);
  }
  return recognized;
}

function sourceClass(value) {
  if (value === 'resonance') return 'chorus';
  if (value === 'instrument' || value === 'relic' || value === 'threshold') return value;
  return 'threshold';
}

function threadClassFor(regionId, classes) {
  const sorted = [...classes].sort();
  let hash = 2166136261;
  const source = `${regionId}:${sorted.join('|')}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return THREAD_CLASSES[hash % THREAD_CLASSES.length];
}

function inactive(recognized = false) {
  return Object.freeze({ active: false, recognized: Boolean(recognized), threadClass: null });
}

export function deriveRegionalMysteryThread({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  exploration,
  listenRequested = false,
  recoveryActive = false,
} = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId) return inactive(false);
  const recognized = recognizedRegionSet(exploration).has(regionId);
  if (!listenRequested || recoveryActive) return inactive(recognized);

  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const classes = [];

  for (const island of islands) {
    const islandId = cleanId(island?.id);
    const islandRegionId = cleanId(island?.regionId);
    const landmarkId = cleanId(island?.landmarkRecord?.id);
    if (!islandId || !landmarkId || islandRegionId !== regionId) continue;
    if (!discovered.has(islandId) || !investigated.has(landmarkId)) continue;
    classes.push(sourceClass(cleanId(island?.landmarkRecord?.encounter?.class)));
  }

  if (classes.length < 2) return inactive(recognized);
  return Object.freeze({
    active: !recognized,
    recognized,
    threadClass: threadClassFor(regionId, classes),
  });
}

export function regionalMysteryThreadPublicState(result) {
  const threadClass = THREAD_CLASSES.includes(result?.threadClass) ? result.threadClass : null;
  return Object.freeze({
    active: Boolean(result?.active && threadClass),
    recognized: Boolean(result?.recognized),
    threadClass: threadClass && (result?.active || result?.recognized) ? threadClass : null,
  });
}
