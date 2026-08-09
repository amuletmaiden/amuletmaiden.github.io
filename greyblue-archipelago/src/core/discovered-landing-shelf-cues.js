const APPROACH_CLASSES = Object.freeze(['acquiring', 'readable', 'final']);
const MAX_HORIZONTAL_DISTANCE = 1400;
const MIN_VERTICAL_CLEARANCE = 18;
const MAX_VERTICAL_CLEARANCE = 850;
const MAX_CUES = 6;

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

function position3(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function approachClass(horizontal, vertical) {
  if (horizontal > 820 || vertical > 480) return 'acquiring';
  if (horizontal > 360 || vertical > 190) return 'readable';
  return 'final';
}

function eligibleShelves({ world, regionId, discoveredIslandIds }) {
  const discovered = idSet(discoveredIslandIds);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const shelves = [];

  for (const island of islands) {
    const islandId = cleanId(island?.id);
    if (!islandId || !discovered.has(islandId) || cleanId(island?.regionId) !== regionId) continue;
    const zones = Array.isArray(island?.landingZones) ? island.landingZones : [];
    for (const zone of zones) {
      const zoneId = cleanId(zone?.id);
      const x = finite(zone?.x);
      const y = finite(zone?.y);
      const z = finite(zone?.z);
      const radius = finite(zone?.radius);
      const heading = finite(zone?.heading) ?? 0;
      if (!zoneId || x == null || y == null || z == null || radius == null || radius <= 0) continue;
      shelves.push(Object.freeze({ islandId, zoneId, x, y, z, radius, heading }));
    }
  }

  return shelves;
}

export function deriveDiscoveredLandingShelfCues({
  world,
  currentRegionId,
  discoveredIslandIds,
  position,
  grounded = false,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  highContrast = false,
  reducedMotion = false,
} = {}) {
  const regionId = cleanId(currentRegionId);
  const dragon = position3(position);
  if (!regionId || !dragon || grounded === true || recoveryActive || crossingActive || restorePublishing) {
    return Object.freeze({ active: false, approachClass: null, cues: Object.freeze([]) });
  }

  const cues = eligibleShelves({ world, regionId, discoveredIslandIds })
    .map((shelf) => {
      const horizontal = Math.hypot(dragon.x - shelf.x, dragon.z - shelf.z);
      const vertical = dragon.y - shelf.y;
      if (horizontal > MAX_HORIZONTAL_DISTANCE || vertical < MIN_VERTICAL_CLEARANCE || vertical > MAX_VERTICAL_CLEARANCE) return null;
      let phase = approachClass(horizontal, vertical);
      if (highContrast === true && phase === 'acquiring') phase = 'readable';
      return Object.freeze({
        islandId: shelf.islandId,
        zoneId: shelf.zoneId,
        x: shelf.x,
        y: shelf.y,
        z: shelf.z,
        radius: shelf.radius,
        heading: shelf.heading,
        approachClass: phase,
        reducedMotion: reducedMotion === true,
        horizontal,
      });
    })
    .filter(Boolean)
    .sort((left, right) => left.horizontal - right.horizontal || left.zoneId.localeCompare(right.zoneId))
    .slice(0, MAX_CUES);

  const phase = cues[0]?.approachClass ?? null;
  return Object.freeze({ active: cues.length > 0, approachClass: phase, cues: Object.freeze(cues) });
}

export function discoveredLandingShelfPresentationPolicy(approachClass, { highContrast = false } = {}) {
  const normalized = APPROACH_CLASSES.includes(approachClass) ? approachClass : 'acquiring';
  const baseOpacity = normalized === 'final' ? 0.42 : normalized === 'readable' ? 0.3 : 0.18;
  return Object.freeze({
    approachClass: normalized,
    opacity: Math.min(0.58, baseOpacity * (highContrast === true ? 1.28 : 1)),
    depthTest: true,
    depthWrite: false,
    fog: true,
    xray: false,
  });
}

export function discoveredLandingShelfCuePublicState(result) {
  const approachClass = APPROACH_CLASSES.includes(result?.approachClass) ? result.approachClass : null;
  return Object.freeze({
    active: Boolean(result?.active && approachClass),
    approachClass,
  });
}
