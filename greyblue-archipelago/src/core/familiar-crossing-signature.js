const MAX_ID = 120;
const SIGNATURES = Object.freeze(['hush', 'pressure', 'resonance', 'clearing']);

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function discoveredSet(values) {
  return new Set(Array.isArray(values) ? values.map(cleanId).filter(Boolean) : []);
}

function completedSet(exploration) {
  const completed = new Set();
  for (const event of Array.isArray(exploration?.events) ? exploration.events : []) {
    if (event?.kind !== 'route-completed') continue;
    const routeId = cleanId(event.routeId || event.id);
    if (routeId) completed.add(routeId);
  }
  return completed;
}

function stableIndex(routeId, regionId = '') {
  const value = `${routeId}|${regionId}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % SIGNATURES.length;
}

export function deriveFamiliarCrossingSignature({
  currentRouteId = null,
  currentRegionId = null,
  discoveredRouteIds = [],
  exploration = null,
  crossingActive = false,
  recoveryActive = false,
  reducedMotion = false,
} = {}) {
  const routeId = cleanId(currentRouteId);
  const regionId = cleanId(currentRegionId);
  const discovered = discoveredSet(discoveredRouteIds);
  const completed = completedSet(exploration);
  const familiar = Boolean(routeId) && discovered.has(routeId) && completed.has(routeId);
  const active = familiar && crossingActive === true && recoveryActive !== true;
  const signature = active ? SIGNATURES[stableIndex(routeId, regionId)] : null;
  return Object.freeze({
    active,
    familiar,
    signature,
    reducedMotion: reducedMotion === true,
  });
}

export function familiarCrossingPublicState(state = null) {
  const signature = SIGNATURES.includes(state?.signature) ? state.signature : null;
  return Object.freeze({
    active: state?.active === true && Boolean(signature),
    familiar: state?.familiar === true,
    signature: state?.active === true ? signature : null,
  });
}

export function familiarCrossingMistMultiplier(signature) {
  const table = Object.freeze({ hush: 0.98, pressure: 1.02, resonance: 0.96, clearing: 0.92 });
  return table[signature] ?? 1;
}
