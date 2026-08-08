const DEFAULT_REVEAL_MS = 900;
const MAX_REVEAL_MS = 4000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function clampDuration(value) {
  return Math.max(0, Math.min(MAX_REVEAL_MS, finite(value, DEFAULT_REVEAL_MS)));
}

export function streamedIslandMistOpacity({ ageMs = 0, distance = 0, fogDensity = 0, reducedMotion = false, revealMs = DEFAULT_REVEAL_MS } = {}) {
  const age = Math.max(0, finite(ageMs));
  const d = Math.max(0, finite(distance));
  const fog = Math.max(0, finite(fogDensity));
  const duration = clampDuration(revealMs);

  // Dense mist permits a shorter visual handoff because the silhouette is already concealed.
  const concealment = clamp01(fog * 180);
  const distanceGate = clamp01((d - 180) / 420);
  const ageGate = reducedMotion || duration === 0 ? 1 : clamp01(age / duration);
  const opacity = clamp01(Math.max(concealment * 0.72, distanceGate) * ageGate);

  return Object.freeze({
    opacity,
    transitioning: !reducedMotion && ageGate < 1,
  });
}

export function resetStreamedIslandTransition(mesh, nowMs = 0) {
  if (!mesh || typeof mesh !== 'object') return false;
  const now = Math.max(0, finite(nowMs));
  mesh.userData = mesh.userData && typeof mesh.userData === 'object' ? mesh.userData : {};
  mesh.userData.streamTransition = Object.freeze({ activatedAtMs: now });
  if (mesh.material && typeof mesh.material === 'object') {
    mesh.material.transparent = true;
    mesh.material.opacity = 0;
  }
  return true;
}

export function clearStreamedIslandTransition(mesh) {
  if (!mesh || typeof mesh !== 'object') return false;
  if (mesh.userData && typeof mesh.userData === 'object') delete mesh.userData.streamTransition;
  if (mesh.material && typeof mesh.material === 'object') {
    mesh.material.opacity = 1;
    mesh.material.transparent = false;
  }
  return true;
}

export const streamedIslandMistTransitionInternals = Object.freeze({ clamp01, clampDuration });
