const MAX_ID = 120;
const PURPOSES = new Set(['landmark', 'frontier', 'roost']);
const CLASSES = new Set(['resonance', 'clearing', 'warmth', 'hush']);

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function eventList(exploration) {
  return Array.isArray(exploration?.events)
    ? exploration.events.slice(-512).filter((event) => event && typeof event === 'object')
    : [];
}

function canonicalEventExists(exploration, kind, predicate) {
  return eventList(exploration).some((event) => event.kind === kind && predicate(event));
}

function stableRegionVariant(regionId) {
  const text = cleanId(regionId);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function classFor(purpose, regionId) {
  const variant = stableRegionVariant(regionId) & 1;
  if (purpose === 'landmark') return variant ? 'hush' : 'resonance';
  if (purpose === 'frontier') return variant ? 'resonance' : 'clearing';
  if (purpose === 'roost') return variant ? 'hush' : 'warmth';
  return null;
}

function activeContext(context, purpose) {
  return Boolean(
    context?.active
    && PURPOSES.has(purpose)
    && context.purpose === purpose
    && cleanId(context.destinationIslandId),
  );
}

function baseResult(purpose, consequenceClass, claimKey, reducedMotion) {
  return Object.freeze({
    active: true,
    phase: 'culminating',
    purpose,
    class: consequenceClass,
    durationMs: reducedMotion ? 2400 : 4600,
    claimKey,
  });
}

export function idleExpeditionCulmination() {
  return Object.freeze({ active: false, phase: 'idle' });
}

export function publicExpeditionCulmination(culmination) {
  if (!culmination?.active) return idleExpeditionCulmination();
  const purpose = PURPOSES.has(culmination.purpose) ? culmination.purpose : null;
  const consequenceClass = CLASSES.has(culmination.class) ? culmination.class : null;
  if (!purpose || !consequenceClass) return idleExpeditionCulmination();
  return Object.freeze({
    active: true,
    phase: 'culminating',
    purpose,
    class: consequenceClass,
    durationMs: Math.max(0, Math.min(8000, Number.isFinite(culmination.durationMs) ? Math.floor(culmination.durationMs) : 0)),
  });
}

export function deriveExpeditionCulmination({
  before = null,
  after = null,
  eventKind = '',
  eventDetail = null,
  exploration = null,
  expectedDestination = null,
  currentRegionId = null,
  reducedMotion = false,
} = {}) {
  const kind = cleanId(eventKind);
  const detail = eventDetail && typeof eventDetail === 'object' ? eventDetail : {};
  const destinationIslandId = cleanId(before?.destinationIslandId);
  const expectedIslandId = cleanId(expectedDestination?.islandId);
  const expectedLandmarkId = cleanId(expectedDestination?.landmarkId);
  const regionId = cleanId(currentRegionId || before?.regionId || after?.regionId);

  if (!destinationIslandId || (expectedIslandId && expectedIslandId !== destinationIslandId)) {
    return idleExpeditionCulmination();
  }

  if (kind === 'landmark-investigated' || kind === 'landmark-flight-encounter') {
    if (!activeContext(before, 'landmark') || !expectedIslandId || !expectedLandmarkId) return idleExpeditionCulmination();
    const landmarkId = cleanId(detail.landmarkId);
    if (!landmarkId || landmarkId !== expectedLandmarkId) return idleExpeditionCulmination();
    if (kind === 'landmark-flight-encounter') {
      const islandId = cleanId(detail.islandId);
      if (!islandId || islandId !== expectedIslandId) return idleExpeditionCulmination();
      const canonical = canonicalEventExists(exploration, 'landmark-flight-encounter', (event) =>
        cleanId(event.landmarkId || event.id) === expectedLandmarkId && cleanId(event.islandId) === expectedIslandId);
      if (!canonical) return idleExpeditionCulmination();
    } else {
      const canonical = canonicalEventExists(exploration, 'landmark-investigated', (event) =>
        cleanId(event.landmarkId || event.id) === expectedLandmarkId);
      if (!canonical) return idleExpeditionCulmination();
    }
    const consequenceClass = classFor('landmark', regionId);
    return baseResult('landmark', consequenceClass, `${kind}:${expectedLandmarkId}:${expectedIslandId}`, reducedMotion);
  }

  if (kind === 'roost-established') {
    if (!activeContext(before, 'roost') || !expectedIslandId) return idleExpeditionCulmination();
    const islandId = cleanId(detail.islandId);
    if (!islandId || islandId !== expectedIslandId) return idleExpeditionCulmination();
    const canonical = canonicalEventExists(exploration, 'roost-established', (event) => cleanId(event.islandId) === expectedIslandId);
    if (!canonical) return idleExpeditionCulmination();
    const consequenceClass = classFor('roost', regionId);
    return baseResult('roost', consequenceClass, `roost-established:${expectedIslandId}`, reducedMotion);
  }

  if (kind === 'route-completed') {
    if (!activeContext(before, 'frontier') || before.phase !== 'crossing') return idleExpeditionCulmination();
    const routeId = cleanId(detail.routeId || detail.id);
    if (!routeId || routeId !== cleanId(before.routeId)) return idleExpeditionCulmination();
    const canonical = canonicalEventExists(exploration, 'route-completed', (event) => cleanId(event.routeId || event.id) === routeId);
    if (!canonical) return idleExpeditionCulmination();
    if (after?.active && after?.purpose === 'frontier') return idleExpeditionCulmination();
    const consequenceClass = classFor('frontier', regionId);
    return baseResult('frontier', consequenceClass, `route-completed:${routeId}`, reducedMotion);
  }

  return idleExpeditionCulmination();
}

export function expeditionCulminationLine(culmination) {
  if (!culmination?.active) return null;
  if (culmination.purpose === 'landmark') {
    return culmination.class === 'hush'
      ? 'The air goes still around the mystery you came to meet.'
      : 'The mist carries the mystery’s answer farther than before.';
  }
  if (culmination.purpose === 'frontier') {
    return culmination.class === 'resonance'
      ? 'The last unfamiliar crossing settles into a remembered way.'
      : 'Open water feels a little less unknown behind you.';
  }
  if (culmination.purpose === 'roost') {
    return culmination.class === 'hush'
      ? 'The journey ends in the quiet of a place already earned.'
      : 'Warm air gathers at the roost; this journey has come home.';
  }
  return null;
}