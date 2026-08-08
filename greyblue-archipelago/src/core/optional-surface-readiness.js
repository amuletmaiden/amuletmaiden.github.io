const MAX_SURFACE_ID_LENGTH = 48;
const MAX_FAILED_SURFACES = 12;

function normalizeSurfaceId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_SURFACE_ID_LENGTH) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) return null;
  return normalized;
}

function freezeSnapshot(failedIds, complete) {
  const failedOptionalSurfaceIds = Object.freeze([...failedIds]);
  return Object.freeze({
    ready: Boolean(complete),
    degraded: failedOptionalSurfaceIds.length > 0,
    failedOptionalSurfaceIds,
  });
}

export function createOptionalSurfaceReadiness(descriptors = []) {
  const normalized = [];
  const seen = new Set();

  if (Array.isArray(descriptors)) {
    for (const descriptor of descriptors) {
      const id = normalizeSurfaceId(descriptor?.id);
      if (!id || typeof descriptor?.load !== "function" || seen.has(id)) continue;
      seen.add(id);
      normalized.push(Object.freeze({ id, load: descriptor.load }));
    }
  }

  const failures = new Set();
  let complete = false;

  return Object.freeze({
    descriptors: Object.freeze([...normalized]),

    async loadAll(onChange) {
      for (const descriptor of normalized) {
        try {
          await descriptor.load();
        } catch {
          if (failures.size < MAX_FAILED_SURFACES) failures.add(descriptor.id);
          onChange?.(freezeSnapshot([...failures].sort(), false));
        }
      }
      complete = true;
      const snapshot = freezeSnapshot([...failures].sort(), true);
      onChange?.(snapshot);
      return snapshot;
    },

    snapshot() {
      return freezeSnapshot([...failures].sort(), complete);
    },
  });
}
