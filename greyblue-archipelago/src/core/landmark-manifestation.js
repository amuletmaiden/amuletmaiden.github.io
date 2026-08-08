const TAU = Math.PI * 2;

const CLASS_PROFILES = Object.freeze({
  resonance: Object.freeze({ emissiveHex: 0x79b7bd, baseIntensity: 0.16, pulseAmplitude: 0.07, pulseHz: 0.18 }),
  instrument: Object.freeze({ emissiveHex: 0x8aaab8, baseIntensity: 0.14, pulseAmplitude: 0.055, pulseHz: 0.14 }),
  relic: Object.freeze({ emissiveHex: 0x9ca88e, baseIntensity: 0.12, pulseAmplitude: 0.045, pulseHz: 0.11 }),
  threshold: Object.freeze({ emissiveHex: 0x7fa99c, baseIntensity: 0.13, pulseAmplitude: 0.05, pulseHz: 0.13 }),
});

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return values;
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function phaseFor(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * TAU;
}

export function collectInvestigatedLandmarkIds(exploration) {
  const ids = new Set();
  const events = Array.isArray(exploration?.events) ? exploration.events : [];
  for (const event of events) {
    if (event?.kind !== 'landmark-investigated') continue;
    const landmarkId = cleanId(event.landmarkId ?? event.id);
    if (landmarkId) ids.add(landmarkId);
  }
  return ids;
}

export function evaluateLandmarkManifestation({
  island,
  discoveredIslandIds,
  investigatedLandmarkIds,
} = {}) {
  const islandId = cleanId(island?.id);
  const landmarkId = cleanId(island?.landmarkRecord?.id);
  if (!islandId || !landmarkId) {
    return Object.freeze({ active: false, reason: 'no-landmark', islandId, landmarkId });
  }

  const discovered = idSet(discoveredIslandIds);
  if (!discovered.has(islandId)) {
    return Object.freeze({ active: false, reason: 'undiscovered', islandId, landmarkId });
  }

  const investigated = idSet(investigatedLandmarkIds);
  if (!investigated.has(landmarkId)) {
    return Object.freeze({ active: false, reason: 'uninvestigated', islandId, landmarkId });
  }

  const encounterClass = cleanId(island.landmarkRecord?.encounter?.class) || 'threshold';
  const profile = CLASS_PROFILES[encounterClass] || CLASS_PROFILES.threshold;
  return Object.freeze({
    active: true,
    reason: 'manifested',
    islandId,
    landmarkId,
    encounterClass,
    emissiveHex: profile.emissiveHex,
    baseIntensity: profile.baseIntensity,
    pulseAmplitude: profile.pulseAmplitude,
    pulseHz: profile.pulseHz,
    phase: phaseFor(landmarkId),
  });
}

export function manifestationIntensity(profile, elapsedSeconds, { reducedMotion = false } = {}) {
  if (!profile?.active) return 0;
  const base = Number.isFinite(profile.baseIntensity) ? profile.baseIntensity : 0;
  const amplitude = Number.isFinite(profile.pulseAmplitude) ? profile.pulseAmplitude : 0;
  const hz = Number.isFinite(profile.pulseHz) ? profile.pulseHz : 0;
  const phase = Number.isFinite(profile.phase) ? profile.phase : 0;
  if (reducedMotion) return Math.max(0, Math.min(0.35, base));
  const seconds = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const value = base + Math.sin(seconds * TAU * hz + phase) * amplitude;
  return Math.max(0, Math.min(0.35, Number.isFinite(value) ? value : base));
}
