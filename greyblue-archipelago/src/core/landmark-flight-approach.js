const TAU = Math.PI * 2;
const DEFAULT_HEADING_CONE = 0.65;
const DEFAULT_MINIMUM_FORWARD_SPEED = 8;
const DEFAULT_NEAR_MULTIPLIER = 1.4;
const DEFAULT_REPEAT_COOLDOWN_MS = 15000;
const VALID_CLASSES = new Set(['resonance', 'instrument', 'relic', 'threshold']);

function boundedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeIds(values) {
  if (values instanceof Set) return new Set([...values].map(boundedId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(boundedId).filter(Boolean));
}

function normalizeAngle(angle) {
  if (!Number.isFinite(angle)) return null;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDistance(left, right) {
  const delta = normalizeAngle(left - right);
  return delta === null ? Number.POSITIVE_INFINITY : Math.abs(delta);
}

function cleanEncounter(island) {
  const landmark = island?.landmarkRecord;
  const encounter = landmark?.encounter;
  const landmarkId = boundedId(landmark?.id);
  const islandId = boundedId(island?.id);
  const triggerRadius = finite(encounter?.triggerRadius);
  const approachBearing = finite(encounter?.approachBearing);
  const minimumAltitude = finite(encounter?.minimumAltitude);
  if (!landmarkId || !islandId || !encounter || !triggerRadius || triggerRadius <= 0 || approachBearing === null || minimumAltitude === null) {
    return null;
  }
  return Object.freeze({
    islandId,
    landmarkId,
    title: String(landmark?.title || landmarkId).slice(0, 160),
    encounterClass: VALID_CLASSES.has(encounter?.class) ? encounter.class : 'threshold',
    triggerRadius,
    approachBearing: ((approachBearing % TAU) + TAU) % TAU,
    minimumAltitude: Math.max(0, minimumAltitude),
    revealText: String(encounter?.revealText || '').slice(0, 320),
    repeatable: encounter?.repeatable === true,
  });
}

function hidden(reason = 'none') {
  return Object.freeze({
    visible: false,
    status: 'hidden',
    reason,
    shouldInvestigate: false,
    landmarkId: null,
    islandId: null,
  });
}

export function evaluateLandmarkFlightApproach({
  world,
  discoveredIslandIds,
  investigatedLandmarkIds,
  position,
  heading,
  altitude,
  forwardSpeed,
  lastTriggeredAt = null,
  now = Date.now(),
  headingCone = DEFAULT_HEADING_CONE,
  minimumForwardSpeed = DEFAULT_MINIMUM_FORWARD_SPEED,
  nearMultiplier = DEFAULT_NEAR_MULTIPLIER,
  repeatCooldownMs = DEFAULT_REPEAT_COOLDOWN_MS,
} = {}) {
  if (!Array.isArray(world?.islands)) return hidden('invalid-world');
  const px = finite(position?.x);
  const pz = finite(position?.z);
  const currentAltitude = finite(altitude ?? position?.y);
  const currentHeading = finite(heading);
  const currentSpeed = finite(forwardSpeed);
  if (px === null || pz === null || currentAltitude === null || currentHeading === null || currentSpeed === null) {
    return hidden('invalid-flight-state');
  }

  const discovered = normalizeIds(discoveredIslandIds);
  const investigated = normalizeIds(investigatedLandmarkIds);
  let best = null;

  for (const island of world.islands) {
    const encounter = cleanEncounter(island);
    if (!encounter || !discovered.has(encounter.islandId)) continue;
    const ix = finite(island?.x);
    const iz = finite(island?.z);
    if (ix === null || iz === null) continue;
    const distance = Math.hypot(px - ix, pz - iz);
    const nearRadius = encounter.triggerRadius * Math.max(1, finite(nearMultiplier) ?? DEFAULT_NEAR_MULTIPLIER);
    if (distance > nearRadius) continue;
    if (!best || distance < best.distance) best = { encounter, distance };
  }

  if (!best) return hidden('no-discovered-landmark-nearby');

  const { encounter, distance } = best;
  const cone = Math.max(0.1, Math.min(Math.PI, finite(headingCone) ?? DEFAULT_HEADING_CONE));
  const speedFloor = Math.max(0, finite(minimumForwardSpeed) ?? DEFAULT_MINIMUM_FORWARD_SPEED);
  const headingError = angleDistance(currentHeading, encounter.approachBearing);
  const inside = distance <= encounter.triggerRadius;
  const altitudeReady = currentAltitude >= encounter.minimumAltitude;
  const headingReady = headingError <= cone;
  const speedReady = currentSpeed >= speedFloor;
  const alreadyInvestigated = investigated.has(encounter.landmarkId);
  const lastAt = finite(lastTriggeredAt);
  const cooldown = Math.max(1000, finite(repeatCooldownMs) ?? DEFAULT_REPEAT_COOLDOWN_MS);
  const cooldownReady = !encounter.repeatable || lastAt === null || now - lastAt >= cooldown;
  const canFire = inside && altitudeReady && headingReady && speedReady
    && (!alreadyInvestigated || encounter.repeatable)
    && cooldownReady;

  let status = 'seeking';
  if (alreadyInvestigated && !encounter.repeatable) status = 'awakened';
  else if (inside && !altitudeReady) status = 'too-low';
  else if (inside && altitudeReady && headingReady && speedReady) status = 'awakened';
  else if (!inside && altitudeReady && headingReady && speedReady) status = 'aligned';

  return Object.freeze({
    visible: true,
    status,
    reason: canFire ? 'truthful-approach' : status,
    shouldInvestigate: canFire,
    islandId: encounter.islandId,
    landmarkId: encounter.landmarkId,
    title: encounter.title,
    encounterClass: encounter.encounterClass,
    revealText: canFire || alreadyInvestigated ? encounter.revealText : '',
    repeatable: encounter.repeatable,
    distance,
    triggerRadius: encounter.triggerRadius,
    minimumAltitude: encounter.minimumAltitude,
    altitudeMargin: currentAltitude - encounter.minimumAltitude,
    headingError,
    headingCone: cone,
    forwardSpeed: currentSpeed,
    minimumForwardSpeed: speedFloor,
    alreadyInvestigated,
    cooldownReady,
  });
}
