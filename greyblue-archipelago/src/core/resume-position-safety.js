const DEFAULT_CLEARANCE = 18;
const SOURCES = new Set(['live', 'checkpoint', 'fallback']);

function finitePosition(position) {
  return Boolean(position)
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z);
}

function safeClearance(clearance) {
  return Number.isFinite(clearance) && clearance >= 0 && clearance <= 200;
}

function snapshot(position) {
  return Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) });
}

export function resumePositionSafe({ position, surfaceHeight, minimumClearance = DEFAULT_CLEARANCE } = {}) {
  if (!finitePosition(position) || !Number.isFinite(surfaceHeight) || !safeClearance(minimumClearance)) return false;
  return position.y - surfaceHeight >= minimumClearance;
}

export function chooseResumePosition({
  livePosition,
  liveSurfaceHeight,
  checkpointPosition,
  checkpointSurfaceHeight,
  fallbackPosition,
  fallbackSurfaceHeight = 0,
  minimumClearance = DEFAULT_CLEARANCE,
} = {}) {
  const candidates = [
    ['live', livePosition, liveSurfaceHeight],
    ['checkpoint', checkpointPosition, checkpointSurfaceHeight],
    ['fallback', fallbackPosition, fallbackSurfaceHeight],
  ];

  for (const [source, position, surfaceHeight] of candidates) {
    if (!SOURCES.has(source)) continue;
    if (!resumePositionSafe({ position, surfaceHeight, minimumClearance })) continue;
    return Object.freeze({ source, position: snapshot(position) });
  }

  return Object.freeze({ source: 'unavailable', position: null });
}

export function publicResumePositionState(result) {
  return Object.freeze({
    active: SOURCES.has(result?.source),
    source: SOURCES.has(result?.source) ? result.source : null,
  });
}
