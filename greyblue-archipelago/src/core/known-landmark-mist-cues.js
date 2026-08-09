const CUE_CLASSES = Object.freeze(['distant', 'emerging', 'near']);
const MIN_DISTANCE = 260;
const MAX_DISTANCE = 1800;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cueClassForDistance(distance, fogDensity) {
  const fog = clamp(finite(fogDensity) ?? 0.00016, 0.00003, 0.0012);
  const fogFactor = clamp(0.00016 / fog, 0.55, 1.35);
  const far = MAX_DISTANCE * fogFactor;
  const middle = far * 0.62;
  const near = Math.max(MIN_DISTANCE, far * 0.31);
  if (distance > far) return null;
  if (distance > middle) return 'distant';
  if (distance > near) return 'emerging';
  return 'near';
}

function eligibleKnownLandmarks({ world, regionId, discoveredIslandIds, investigatedLandmarkIds }) {
  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  return islands
    .filter((island) => cleanId(island?.regionId) === regionId)
    .map((island) => {
      const islandId = cleanId(island?.id);
      const landmarkId = cleanId(island?.landmarkRecord?.id);
      const x = finite(island?.x);
      const z = finite(island?.z);
      const height = finite(island?.height);
      if (!islandId || !landmarkId || x == null || z == null || height == null) return null;
      if (!discovered.has(islandId) || !investigated.has(landmarkId)) return null;
      return Object.freeze({ islandId, landmarkId, x, y: height + 48, z });
    })
    .filter(Boolean);
}

function distance3(position, cue) {
  const x = finite(position?.x);
  const y = finite(position?.y);
  const z = finite(position?.z);
  if (x == null || y == null || z == null) return null;
  const dx = x - cue.x;
  const dy = y - cue.y;
  const dz = z - cue.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

export function deriveKnownLandmarkMistCues({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  position,
  fogDensity,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  localizedInteractionActive = false,
  highContrast = false,
  reducedMotion = false,
} = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId || recoveryActive || crossingActive || restorePublishing || localizedInteractionActive) {
    return Object.freeze({ active: false, cueClass: null, cues: Object.freeze([]) });
  }

  const eligible = eligibleKnownLandmarks({ world, regionId, discoveredIslandIds, investigatedLandmarkIds });
  const cues = eligible
    .map((candidate) => {
      const distance = distance3(position, candidate);
      if (distance == null) return null;
      let cueClass = cueClassForDistance(distance, fogDensity);
      if (!cueClass) return null;
      if (highContrast === true && cueClass === 'distant') cueClass = 'emerging';
      return Object.freeze({
        islandId: candidate.islandId,
        landmarkId: candidate.landmarkId,
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        cueClass,
        intensity: cueClass === 'near' ? 1 : cueClass === 'emerging' ? 0.68 : 0.38,
        reducedMotion: reducedMotion === true,
      });
    })
    .filter(Boolean)
    .sort((left, right) => {
      const order = { near: 0, emerging: 1, distant: 2 };
      const byClass = order[left.cueClass] - order[right.cueClass];
      return byClass || left.landmarkId.localeCompare(right.landmarkId);
    })
    .slice(0, 8);

  const cueClass = cues[0]?.cueClass ?? null;
  return Object.freeze({ active: cues.length > 0, cueClass, cues: Object.freeze(cues) });
}

export function knownLandmarkMistCuePresentationPolicy(cueClass, { highContrast = false } = {}) {
  const normalized = CUE_CLASSES.includes(cueClass) ? cueClass : 'distant';
  const baseOpacity = normalized === 'near' ? 0.48 : normalized === 'emerging' ? 0.34 : 0.2;
  const scale = normalized === 'near' ? 1.15 : normalized === 'emerging' ? 1 : 0.82;
  return Object.freeze({
    cueClass: normalized,
    opacity: Math.min(0.62, baseOpacity * (highContrast === true ? 1.25 : 1)),
    scale,
    depthTest: true,
    depthWrite: false,
    fog: true,
    xray: false,
  });
}

export function knownLandmarkMistCuePublicState(result) {
  const cueClass = CUE_CLASSES.includes(result?.cueClass) ? result.cueClass : null;
  return Object.freeze({
    active: Boolean(result?.active && cueClass),
    cueClass,
  });
}
