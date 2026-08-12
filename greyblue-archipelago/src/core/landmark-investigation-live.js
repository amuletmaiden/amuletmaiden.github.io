import { deriveLandmarkInvestigation } from "./landmark-investigation.js";

const INACTIVE = Object.freeze({ available: false, prompt: null });

export function deriveLiveLandmarkInvestigation({
  islands = [],
  discoveredIslandIds = [],
  explorationEvents = [],
  currentRegionId = null,
  position = null,
  yaw = 0,
  airborne = true,
  grounded = false,
  paused = false,
  recovering = false,
  restoring = false,
  crossing = false,
  interact = false,
} = {}) {
  if (!Array.isArray(islands) || typeof currentRegionId !== "string" || !currentRegionId) {
    return inactive();
  }
  if (!finite(position?.x) || !finite(position?.y) || !finite(position?.z)) return inactive();

  const discovered = new Set(normalizeIds(discoveredIslandIds));
  const investigated = new Set(
    (Array.isArray(explorationEvents) ? explorationEvents : [])
      .filter((event) => event?.kind === "landmark-investigated" && typeof event.landmarkId === "string")
      .map((event) => event.landmarkId),
  );

  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const island of islands) {
    if (island?.regionId !== currentRegionId || !discovered.has(island?.id)) continue;
    const landmarkId = island?.landmarkRecord?.id;
    if (typeof landmarkId !== "string" || !landmarkId) continue;

    const result = deriveLandmarkInvestigation({
      island,
      discovered: true,
      investigated: investigated.has(landmarkId),
      position,
      yaw,
      airborne,
      grounded,
      paused,
      recovering,
      restoring,
      crossing,
      interact,
    });
    if (!result.state.available && !result.completed) continue;

    const distance = Math.hypot(position.x - Number(island.x), position.z - Number(island.z));
    if (!finite(distance) || distance >= selectedDistance) continue;
    selected = result;
    selectedDistance = distance;
  }

  return selected || inactive();
}

function inactive() {
  return Object.freeze({ state: INACTIVE, completed: false, event: null });
}

function normalizeIds(values) {
  if (values instanceof Set) return [...values].filter(validId);
  if (!Array.isArray(values)) return [];
  return values.filter(validId);
}

function validId(value) {
  return typeof value === "string" && value.length > 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}
