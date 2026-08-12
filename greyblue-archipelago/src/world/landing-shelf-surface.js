const CORE_RADIUS_RATIO = 0.55;

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function finiteZone(zone) {
  const x = Number(zone?.x);
  const y = Number(zone?.y);
  const z = Number(zone?.z);
  const radius = Number(zone?.radius);
  if (![x, y, z, radius].every(Number.isFinite) || radius <= 0) return null;
  return { x, y, z, radius };
}

export function composeLandingShelfHeight({ baseHeight, x, z, landingZones } = {}) {
  const base = Number(baseHeight);
  const px = Number(x);
  const pz = Number(z);
  if (!Number.isFinite(base) || !Number.isFinite(px) || !Number.isFinite(pz) || !Array.isArray(landingZones)) {
    return baseHeight;
  }

  let selected = null;
  let selectedRatio = Number.POSITIVE_INFINITY;
  for (const candidate of landingZones) {
    const zone = finiteZone(candidate);
    if (!zone) continue;
    const distance = Math.hypot(px - zone.x, pz - zone.z);
    const ratio = distance / zone.radius;
    if (ratio >= 1 || ratio >= selectedRatio) continue;
    selected = { ...zone, distance };
    selectedRatio = ratio;
  }
  if (!selected) return base;

  const coreRadius = selected.radius * CORE_RADIUS_RATIO;
  if (selected.distance <= coreRadius) return selected.y;
  const blend = smoothstep((selected.distance - coreRadius) / Math.max(1e-6, selected.radius - coreRadius));
  return selected.y + (base - selected.y) * blend;
}

export const landingShelfSurfaceInternals = Object.freeze({ CORE_RADIUS_RATIO, smoothstep, finiteZone });
