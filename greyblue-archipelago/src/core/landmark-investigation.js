const MAX_APPROACH_ERROR = 0.9;

export function deriveLandmarkInvestigation({
  island = null,
  discovered = false,
  investigated = false,
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
  const landmark = island?.landmarkRecord;
  const encounter = landmark?.encounter;
  const interrupted = paused || recovering || restoring || crossing;
  const finitePosition = finite(position?.x) && finite(position?.y) && finite(position?.z);
  const authored = Boolean(
    island?.id
    && island?.regionId
    && landmark?.id
    && encounter
    && finite(island?.x)
    && finite(island?.z)
    && finite(encounter.triggerRadius)
    && encounter.triggerRadius > 0,
  );

  if (!authored || !discovered || investigated || interrupted || !finitePosition) {
    return inactive();
  }

  const distance = Math.hypot(position.x - island.x, position.z - island.z);
  if (!finite(distance) || distance > encounter.triggerRadius) return inactive();

  const settled = grounded === true || airborne === false;
  if (!settled) {
    if (!finite(encounter.minimumAltitude) || position.y < encounter.minimumAltitude) return inactive();
    if (!finite(yaw) || !finite(encounter.approachBearing)) return inactive();
    if (Math.abs(angleDelta(yaw, encounter.approachBearing)) > MAX_APPROACH_ERROR) return inactive();
  }

  const state = Object.freeze({ available: true, prompt: "investigate" });
  if (interact !== true) return Object.freeze({ state, completed: false, event: null });

  return Object.freeze({
    state: Object.freeze({ available: false, prompt: null }),
    completed: true,
    event: Object.freeze({
      landmarkId: landmark.id,
      regionId: island.regionId,
    }),
  });
}

function inactive() {
  return Object.freeze({
    state: Object.freeze({ available: false, prompt: null }),
    completed: false,
    event: null,
  });
}

function angleDelta(left, right) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

function finite(value) {
  return Number.isFinite(Number(value));
}
