const SKY_RUN_CLASSES = Object.freeze(['wake', 'ring', 'hush', 'weathering']);
const SKY_RUN_PHASES = Object.freeze(['first', 'middle', 'final']);
const SKY_RUN_RADIUS = 88;
const MIN_ALTITUDE = 165;
const MAX_ALTITUDE = 640;

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

function inactive({ available = false, completed = false, echoClass = null } = {}) {
  return Object.freeze({
    available,
    active: false,
    completed,
    phase: null,
    echoClass: SKY_RUN_CLASSES.includes(echoClass) ? echoClass : null,
    index: null,
    plan: null,
    echo: null,
  });
}

function eligibleHosts({ world, regionId, discoveredIslandIds, investigatedLandmarkIds }) {
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

function orderedPlan(hosts, regionId, echoClass) {
  if (hosts.length < 3) return null;
  const hash = stableHash(`${regionId}|${echoClass}|regional-sky-run`);
  const start = hash % hosts.length;
  const direction = ((hash >>> 5) & 1) === 0 ? 1 : -1;
  const chosen = [];
  let cursor = start;

  while (chosen.length < 3) {
    const host = hosts[(cursor + hosts.length) % hosts.length];
    if (!chosen.some((candidate) => candidate.landmarkId === host.landmarkId)) chosen.push(host);
    cursor += direction;
  }

  return Object.freeze(chosen.map((host, index) => {
    const placementHash = stableHash(`${regionId}|${echoClass}|${host.landmarkId}|${index}`);
    const altitudeOffset = 185 + (placementHash % 126);
    return Object.freeze({
      regionId,
      hostIslandId: host.islandId,
      hostLandmarkId: host.landmarkId,
      echoClass,
      x: host.x,
      y: Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, host.height + altitudeOffset)),
      z: host.z,
      radius: SKY_RUN_RADIUS,
    });
  }));
}

function sameEcho(left, right) {
  return Boolean(left && right
    && left.regionId === right.regionId
    && left.hostIslandId === right.hostIslandId
    && left.hostLandmarkId === right.hostLandmarkId
    && left.echoClass === right.echoClass
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z
    && left.radius === right.radius);
}

function inside(position, echo) {
  const x = finite(position?.x);
  const y = finite(position?.y);
  const z = finite(position?.z);
  if (x == null || y == null || z == null || !echo) return false;
  const dx = x - echo.x;
  const dy = y - echo.y;
  const dz = z - echo.z;
  return (dx * dx) + (dy * dy) + (dz * dz) <= echo.radius * echo.radius;
}

function normalizeState(state, plan, echoClass) {
  const index = Number.isInteger(state?.index) ? state.index : -1;
  if (!state?.active || index < 0 || index > 2 || state.echoClass !== echoClass) return null;
  if (!Array.isArray(state?.plan) || state.plan.length !== 3) return null;
  for (let cursor = 0; cursor < 3; cursor += 1) {
    if (!sameEcho(state.plan[cursor], plan[cursor])) return null;
  }
  if (!sameEcho(state.echo, plan[index])) return null;
  return index;
}

function activeState(plan, index, echoClass) {
  return Object.freeze({
    available: true,
    active: true,
    completed: false,
    phase: SKY_RUN_PHASES[index],
    echoClass,
    index,
    plan,
    echo: plan[index],
  });
}

export function stepRegionalAerialSkyRun({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  remembered = false,
  memoryClass,
  startRequested = false,
  position,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  localizedInteractionActive = false,
  sessionCompleted = false,
  state,
} = {}) {
  const regionId = cleanId(currentRegionId);
  const echoClass = SKY_RUN_CLASSES.includes(memoryClass) ? memoryClass : null;
  if (!regionId || remembered !== true || !echoClass) return inactive();
  if (recoveryActive || crossingActive || restorePublishing || localizedInteractionActive) return inactive();

  const hosts = eligibleHosts({ world, regionId, discoveredIslandIds, investigatedLandmarkIds });
  const plan = orderedPlan(hosts, regionId, echoClass);
  if (!plan) return inactive();
  if (sessionCompleted) return inactive({ available: true, completed: true, echoClass });

  let index = normalizeState(state, plan, echoClass);
  if (index == null) {
    if (startRequested !== true) return inactive({ available: true });
    index = 0;
  }

  const current = activeState(plan, index, echoClass);
  if (!inside(position, current.echo)) return current;
  if (index === 2) return inactive({ available: true, completed: true, echoClass });
  return activeState(plan, index + 1, echoClass);
}

export function regionalAerialSkyRunPublicState(result) {
  const echoClass = SKY_RUN_CLASSES.includes(result?.echoClass) ? result.echoClass : null;
  const phase = SKY_RUN_PHASES.includes(result?.phase) ? result.phase : null;
  return Object.freeze({
    available: Boolean(result?.available),
    active: Boolean(result?.active && echoClass && phase),
    phase: result?.active && echoClass ? phase : null,
    echoClass,
    completed: Boolean(result?.completed && echoClass),
  });
}
