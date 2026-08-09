const ECHO_CLASSES = Object.freeze(['wake', 'ring', 'hush', 'weathering']);
const ECHO_RADIUS = 92;
const MIN_ECHO_ALTITUDE = 150;
const MAX_ECHO_ALTITUDE = 620;

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

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function inactive(available = false, completed = false, echoClass = null) {
  return Object.freeze({
    available,
    active: false,
    completed,
    echoClass: ECHO_CLASSES.includes(echoClass) ? echoClass : null,
    echo: null,
  });
}

function eligibleKnownHosts({ world, regionId, discoveredIslandIds, investigatedLandmarkIds }) {
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
      return Object.freeze({ islandId, landmarkId, x, z, height });
    })
    .filter(Boolean)
    .sort((left, right) => left.landmarkId.localeCompare(right.landmarkId));
}

function chooseEcho(hosts, regionId, echoClass) {
  if (!hosts.length) return null;
  const hash = stableHash(`${regionId}|${echoClass}|aerial-echo`);
  const host = hosts[hash % hosts.length];
  const altitudeOffset = 170 + (hash % 121);
  const y = Math.max(MIN_ECHO_ALTITUDE, Math.min(MAX_ECHO_ALTITUDE, host.height + altitudeOffset));
  return Object.freeze({
    regionId,
    hostIslandId: host.islandId,
    hostLandmarkId: host.landmarkId,
    echoClass,
    x: host.x,
    y,
    z: host.z,
    radius: ECHO_RADIUS,
  });
}

function normalizeEcho(state, hosts, regionId, echoClass) {
  if (!state?.active || !state?.echo) return null;
  const echo = state.echo;
  if (cleanId(echo.regionId) !== regionId || echo.echoClass !== echoClass) return null;
  const host = hosts.find((candidate) => candidate.islandId === cleanId(echo.hostIslandId)
    && candidate.landmarkId === cleanId(echo.hostLandmarkId));
  if (!host) return null;
  const expected = chooseEcho(hosts, regionId, echoClass);
  if (!expected || expected.hostIslandId !== host.islandId || expected.hostLandmarkId !== host.landmarkId) return null;
  return expected;
}

function insideEcho(position, echo) {
  const x = finite(position?.x);
  const y = finite(position?.y);
  const z = finite(position?.z);
  if (x == null || y == null || z == null) return false;
  const dx = x - echo.x;
  const dy = y - echo.y;
  const dz = z - echo.z;
  return (dx * dx) + (dy * dy) + (dz * dz) <= echo.radius * echo.radius;
}

export function stepRegionalAerialEcho({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  remembered = false,
  memoryClass,
  listenRequested = false,
  position,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  localizedInteractionActive = false,
  state,
} = {}) {
  const regionId = cleanId(currentRegionId);
  const echoClass = ECHO_CLASSES.includes(memoryClass) ? memoryClass : null;
  if (!regionId || remembered !== true || !echoClass) return inactive(false);
  if (recoveryActive || crossingActive || restorePublishing || localizedInteractionActive) return inactive(false);

  const hosts = eligibleKnownHosts({
    world,
    regionId,
    discoveredIslandIds,
    investigatedLandmarkIds,
  });
  if (!hosts.length) return inactive(false);

  let echo = normalizeEcho(state, hosts, regionId, echoClass);
  if (!echo) {
    if (listenRequested !== true) return inactive(true);
    echo = chooseEcho(hosts, regionId, echoClass);
  }
  if (!echo) return inactive(false);

  if (insideEcho(position, echo)) return inactive(true, true, echoClass);
  return Object.freeze({
    available: true,
    active: true,
    completed: false,
    echoClass,
    echo,
  });
}

export function regionalAerialEchoPublicState(result) {
  const echoClass = ECHO_CLASSES.includes(result?.echoClass) ? result.echoClass : null;
  return Object.freeze({
    available: Boolean(result?.available),
    active: Boolean(result?.active && echoClass),
    completed: Boolean(result?.completed && echoClass),
    echoClass,
  });
}
