const MEMORY_CLASSES = Object.freeze(['wake', 'ring', 'hush', 'weathering']);

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function regionalFlightMemoryClass(regionId) {
  const id = cleanId(regionId);
  if (!id) return null;
  return MEMORY_CLASSES[stableHash(id) % MEMORY_CLASSES.length];
}

export function deriveRegionalFlightMemoryEvent({
  circuitEvent,
  currentRegionId,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  occurredAt = Date.now(),
} = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId || recoveryActive || crossingActive || restorePublishing) return null;
  if (circuitEvent?.event !== 'completed' || circuitEvent?.completed !== true) return null;
  const memoryClass = regionalFlightMemoryClass(regionId);
  if (!memoryClass) return null;
  return Object.freeze({
    kind: 'regional-flight-memory',
    id: regionId,
    regionId,
    memoryClass,
    occurredAt: Number.isFinite(occurredAt) && occurredAt >= 0 ? Math.floor(occurredAt) : 0,
  });
}

export function collectRegionalFlightMemories(exploration = null) {
  const events = Array.isArray(exploration?.events) ? exploration.events : [];
  const memories = new Map();
  for (const candidate of events) {
    if (candidate?.kind !== 'regional-flight-memory') continue;
    const regionId = cleanId(candidate.regionId || candidate.id);
    const memoryClass = MEMORY_CLASSES.includes(candidate.memoryClass) ? candidate.memoryClass : null;
    if (!regionId || !memoryClass || memories.has(regionId)) continue;
    memories.set(regionId, Object.freeze({ regionId, memoryClass }));
  }
  return memories;
}

export function regionalFlightMemoryPublicState({ exploration, currentRegionId } = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId) return Object.freeze({ active: false, remembered: false, memoryClass: null });
  const memory = collectRegionalFlightMemories(exploration).get(regionId);
  return Object.freeze({
    active: Boolean(memory),
    remembered: Boolean(memory),
    memoryClass: memory?.memoryClass ?? null,
  });
}
