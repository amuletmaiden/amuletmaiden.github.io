const DEFAULTS = Object.freeze({
  flightClearance: 36,
  minimumAltitude: 72,
  searchRadius: 96,
  searchRings: 3,
  samplesPerRing: 8,
});

export function resolveRecoveryPlacement({
  candidate,
  fallback,
  sampleSurface,
  options = {},
} = {}) {
  if (typeof sampleSurface !== "function") {
    throw new TypeError("sampleSurface must be a function");
  }
  const settings = { ...DEFAULTS, ...options };
  const safeFallback = finiteVector(fallback) ? cloneVector(fallback) : { x: 0, y: 160, z: 0 };
  const preferred = finiteVector(candidate) ? cloneVector(candidate) : safeFallback;
  const probes = buildProbeSequence(preferred, safeFallback, settings);

  let best = null;
  for (const probe of probes) {
    const surface = normalizeSurface(sampleSurface(probe.x, probe.z));
    if (!surface || surface.surface === "water") continue;
    const requiredY = Math.max(
      Number(settings.minimumAltitude) || DEFAULTS.minimumAltitude,
      surface.height + Math.max(0, Number(settings.flightClearance) || DEFAULTS.flightClearance),
    );
    const placement = {
      x: probe.x,
      y: Math.max(requiredY, Number.isFinite(preferred.y) ? preferred.y : requiredY),
      z: probe.z,
      surface,
      usedFallback: probe.source !== "candidate",
    };
    if (!best || probe.priority < best.priority) best = { ...placement, priority: probe.priority };
  }

  if (best) {
    const { priority: _priority, ...placement } = best;
    return placement;
  }

  return {
    x: safeFallback.x,
    y: Math.max(safeFallback.y, Number(settings.minimumAltitude) || DEFAULTS.minimumAltitude),
    z: safeFallback.z,
    surface: null,
    usedFallback: true,
  };
}

function buildProbeSequence(candidate, fallback, settings) {
  const probes = [
    { x: candidate.x, z: candidate.z, source: "candidate", priority: 0 },
    { x: fallback.x, z: fallback.z, source: "fallback", priority: 1 },
  ];
  const rings = clampInteger(settings.searchRings, 0, 8, DEFAULTS.searchRings);
  const samples = clampInteger(settings.samplesPerRing, 4, 32, DEFAULTS.samplesPerRing);
  const radius = Math.max(0, Number(settings.searchRadius) || DEFAULTS.searchRadius);
  for (let ring = 1; ring <= rings; ring += 1) {
    const distance = radius * ring / Math.max(rings, 1);
    for (let index = 0; index < samples; index += 1) {
      const angle = index / samples * Math.PI * 2;
      probes.push({
        x: fallback.x + Math.cos(angle) * distance,
        z: fallback.z + Math.sin(angle) * distance,
        source: "search",
        priority: 1 + ring + index / samples,
      });
    }
  }
  return probes;
}

function normalizeSurface(value) {
  if (!value || typeof value !== "object") return null;
  const height = Number(value.height);
  if (!Number.isFinite(height)) return null;
  return {
    height,
    surface: typeof value.surface === "string" ? value.surface : height > 0 ? "terrain" : "water",
    id: value.id ?? null,
  };
}

function finiteVector(value) {
  return Boolean(value)
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.z));
}

function cloneVector(value) {
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

export { DEFAULTS as RECOVERY_PLACEMENT_DEFAULTS };
