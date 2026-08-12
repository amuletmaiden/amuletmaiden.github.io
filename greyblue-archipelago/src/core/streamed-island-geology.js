const TAU = Math.PI * 2;
const MIN_PROFILE_SCALE = 0.68;
const MAX_PROFILE_SCALE = 1;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashString(value) {
  const text = typeof value === 'string' ? value : '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function phase(hash, shift) {
  return (((hash >>> shift) & 0xff) / 255) * TAU;
}

function finiteTriples(values) {
  if (!values || typeof values.length !== 'number' || values.length % 3 !== 0) return null;
  const copy = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) return null;
    copy[index] = value;
  }
  return copy;
}

export function profileStreamedIslandVertices(basePositions, island = {}) {
  const base = finiteTriples(basePositions);
  if (!base) return new Float32Array();
  const id = typeof island?.id === 'string' ? island.id.trim() : '';
  if (!id) return base;

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < base.length; index += 3) {
    minY = Math.min(minY, base[index]);
    maxY = Math.max(maxY, base[index]);
  }
  const height = Math.max(1e-6, maxY - minY);
  const hash = hashString(id);
  const phaseA = phase(hash, 0);
  const phaseB = phase(hash, 8);
  const phaseC = phase(hash, 16);
  const landmark = island?.landmark === true;
  const output = new Float32Array(base);

  for (let index = 0; index < base.length; index += 3) {
    const x = base[index];
    const y = base[index + 1];
    const z = base[index + 2];
    const radius = Math.hypot(x, z);
    if (radius <= 1e-7) continue;

    const angle = Math.atan2(z, x);
    const vertical = clamp((y - minY) / height, 0, 1);
    const skirt = 0.96 - 0.08 * vertical;
    const shoulder = Math.sin(Math.PI * vertical) * 0.055;
    const largeCrag = Math.sin(angle * 3 + phaseA) * 0.055;
    const secondaryCrag = Math.sin(angle * 5 + phaseB) * (landmark ? 0.048 : 0.032);
    const highCrag = Math.sin(angle * 7 + phaseC) * (landmark ? 0.035 : 0.018) * vertical;
    const profile = clamp(skirt + shoulder + largeCrag + secondaryCrag + highCrag, MIN_PROFILE_SCALE, MAX_PROFILE_SCALE);

    output[index] = x * profile;
    output[index + 1] = y;
    output[index + 2] = z * profile;
  }

  return output;
}

export const streamedIslandGeologyInternals = Object.freeze({
  MIN_PROFILE_SCALE,
  MAX_PROFILE_SCALE,
  hashString,
});
