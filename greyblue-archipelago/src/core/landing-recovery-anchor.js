const MAX_POSITION_MAGNITUDE = 24000;
const MIN_ALTITUDE = -100;
const MAX_ALTITUDE = 8000;

export function createLandingRecoveryAnchor({ loadGame, saveGame, now = () => Date.now() } = {}) {
  if (typeof loadGame !== 'function' || typeof saveGame !== 'function') {
    throw new TypeError('landing recovery anchor requires loadGame and saveGame');
  }

  let wasGrounded = false;
  let lastAnchorAt = null;
  let lastAnchorPosition = null;
  let anchorCount = 0;
  let lastError = null;

  function consume(state) {
    const grounded = isSafeGroundedState(state);
    if (!grounded) {
      wasGrounded = false;
      return false;
    }
    if (wasGrounded) return false;
    wasGrounded = true;

    try {
      const previous = loadGame() ?? {};
      const position = normalizePosition(state.position);
      const snapshot = {
        seed: Number.isInteger(state.seed) ? state.seed : previous.seed,
        position,
        discovered: Array.isArray(state.discovered) ? state.discovered : previous.discovered,
        discoveredRoutes: Array.isArray(state.discoveredRoutes) ? state.discoveredRoutes : previous.discoveredRoutes,
        guidance: guidanceFrom(state, previous.guidance),
        exploration: previous.exploration,
        settings: previous.settings ?? {},
      };

      // The save layer intentionally promotes the previous persisted position to the
      // recovery checkpoint. Two identical bounded writes make this deliberate safe
      // landing both the current save position and the durable recovery anchor.
      saveGame(snapshot);
      const anchored = saveGame(snapshot);
      lastAnchorAt = Number.isFinite(now()) ? Math.max(0, Math.floor(now())) : 0;
      lastAnchorPosition = { ...anchored.recoveryCheckpoint };
      anchorCount += 1;
      lastError = null;
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  function telemetry() {
    return Object.freeze({
      anchorCount,
      lastAnchorAt,
      lastAnchorPosition: lastAnchorPosition ? Object.freeze({ ...lastAnchorPosition }) : null,
      error: lastError,
    });
  }

  return Object.freeze({ consume, telemetry });
}

function guidanceFrom(state, fallback) {
  const activeRouteId = typeof state?.guidancePreference === 'string'
    ? state.guidancePreference.trim()
    : typeof fallback?.activeRouteId === 'string'
      ? fallback.activeRouteId.trim()
      : '';
  if (!activeRouteId) return null;
  const progress = Number.isFinite(state?.routeGuidance?.progress)
    ? Math.max(0, Math.min(1, state.routeGuidance.progress))
    : Number.isFinite(fallback?.progress)
      ? Math.max(0, Math.min(1, fallback.progress))
      : 0;
  return { activeRouteId, progress };
}

function isSafeGroundedState(state) {
  if (!state || typeof state !== 'object' || state.paused || state.ready !== true) return false;
  if (state.collision?.grounded !== true) return false;
  if (state.collision?.requiresRecovery === true) return false;
  if (state.flight?.airborne === true) return false;
  return isValidPosition(state.position);
}

function isValidPosition(position) {
  if (!position || typeof position !== 'object') return false;
  const { x, y, z } = position;
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    && Math.abs(x) <= MAX_POSITION_MAGNITUDE
    && Math.abs(z) <= MAX_POSITION_MAGNITUDE
    && y >= MIN_ALTITUDE
    && y <= MAX_ALTITUDE;
}

function normalizePosition(position) {
  return { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
}
