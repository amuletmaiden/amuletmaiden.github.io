let candidates = Object.freeze([]);

function cleanCandidate(island) {
  const id = typeof island?.id === 'string' ? island.id.trim().slice(0, 120) : '';
  const x = Number(island?.x);
  const z = Number(island?.z);
  const scale = Number(island?.scale);
  const height = Number(island?.height);
  if (!id || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return Object.freeze({ id, x, z, scale, height, landmark: island?.landmark === true });
}

export function setKnownVoyageStreamingCandidates(islands = []) {
  const next = [];
  const seen = new Set();
  for (const raw of Array.isArray(islands) ? islands : []) {
    const island = cleanCandidate(raw);
    if (!island || seen.has(island.id)) continue;
    seen.add(island.id);
    next.push(island);
    if (next.length >= 8) break;
  }
  candidates = Object.freeze(next);
}

export function getKnownVoyageStreamingCandidates() {
  return candidates;
}

export function clearKnownVoyageStreamingCandidates() {
  candidates = Object.freeze([]);
}
