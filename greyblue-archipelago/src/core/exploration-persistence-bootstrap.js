import { createExplorationLifecycle } from './exploration-lifecycle.js';
import { createLandingRecoveryAnchor } from './landing-recovery-anchor.js';
import { loadGame, saveGame } from './save.js';

const restored = loadGame();
const lifecycle = createExplorationLifecycle(restored?.exploration);
const landingRecoveryAnchor = createLandingRecoveryAnchor({ loadGame, saveGame });
const recovery = restored?.explorationRecovery ?? null;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let lastFlushAt = restored?.savedAt ?? null;
let lastFlushReason = restored?.exploration?.events?.length ? 'restore' : null;
let flushError = null;
let disposed = false;

function guidanceFrom(state, fallback) {
  const routeId = typeof state?.guidancePreference === 'string' && state.guidancePreference
    ? state.guidancePreference
    : fallback?.activeRouteId ?? null;
  if (!routeId) return null;
  const progress = Number.isFinite(state?.routeGuidance?.progress)
    ? state.routeGuidance.progress
    : fallback?.progress ?? 0;
  return { activeRouteId: routeId, progress };
}

function stateForSave(state) {
  const previous = loadGame() ?? restored ?? {};
  return {
    seed: Number.isInteger(state?.seed) ? state.seed : previous.seed,
    position: state?.position ?? previous.position,
    discovered: Array.isArray(state?.discovered) ? state.discovered : previous.discovered,
    discoveredRoutes: Array.isArray(state?.discoveredRoutes) ? state.discoveredRoutes : previous.discoveredRoutes,
    guidance: guidanceFrom(state, previous.guidance),
    exploration: lifecycle.snapshot(),
    settings: previous.settings ?? {},
  };
}

function flush(reason) {
  if (!lifecycle.dirty && reason !== 'restore-checkpoint') return false;
  try {
    const saved = saveGame(stateForSave(currentState));
    lifecycle.markFlushed();
    lastFlushAt = saved.savedAt;
    lastFlushReason = reason;
    flushError = null;
    return true;
  } catch (error) {
    flushError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

function consume(state) {
  if (!state || typeof state !== 'object') return;
  let changed = false;
  if (state.ready && state.currentRegion?.id) {
    changed = lifecycle.recordRegion(state.currentRegion, Date.now()) || changed;
  }
  const discovery = state.latestDiscovery;
  if (discovery?.landmark?.id) {
    changed = lifecycle.recordLandmark(
      discovery.landmark,
      discovery.regionId ?? state.currentRegion?.id ?? null,
      discovery.discoveredAt ?? Date.now(),
    ) || changed;
  }
  if (changed) flush('discovery');
  landingRecoveryAnchor.consume(state);
}

function onRouteCompleted(event) {
  if (disposed) return;
  const routeId = typeof event?.detail?.routeId === 'string'
    ? event.detail.routeId.trim().slice(0, 120)
    : '';
  if (!routeId) return;
  const occurredAt = Number.isFinite(event?.detail?.occurredAt)
    ? Math.max(0, Math.floor(event.detail.occurredAt))
    : Date.now();
  if (lifecycle.recordRouteCompletion(routeId, occurredAt)) flush('route-completed');
}

function onLandmarkInvestigated(event) {
  if (disposed) return;
  const landmarkId = typeof event?.detail?.landmarkId === 'string'
    ? event.detail.landmarkId.trim().slice(0, 120)
    : '';
  if (!landmarkId) return;
  const regionId = typeof event?.detail?.regionId === 'string'
    ? event.detail.regionId.trim().slice(0, 120)
    : null;
  const occurredAt = Number.isFinite(event?.detail?.occurredAt)
    ? Math.max(0, Math.floor(event.detail.occurredAt))
    : Date.now();
  if (lifecycle.recordLandmarkInvestigation(landmarkId, regionId, occurredAt)) {
    flush('landmark-investigated');
  }
}

function onApproachChallenge(event) {
  if (disposed || event?.detail?.kind !== 'succeeded') return;
  const islandId = typeof event?.detail?.islandId === 'string'
    ? event.detail.islandId.trim().slice(0, 120)
    : '';
  const corridorId = typeof event?.detail?.corridorId === 'string'
    ? event.detail.corridorId.trim().slice(0, 120)
    : '';
  if (!islandId || !corridorId) return;

  const discovered = new Set(Array.isArray(currentState?.discovered) ? currentState.discovered : []);
  const active = currentState?.approachChallenge;
  const matchesTruthfulSuccess = discovered.has(islandId)
    && active?.phase === 'succeeded'
    && active?.islandId === islandId
    && active?.corridorId === corridorId;
  if (!matchesTruthfulSuccess) return;

  if (lifecycle.recordApproachMastery(islandId, corridorId, Date.now())) {
    flush('approach-mastered');
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:approach-mastered', {
      detail: Object.freeze({ islandId, corridorId, soundHook: 'approach-mastery' }),
    }));
  }
}

function decorate(state) {
  if (!state || typeof state !== 'object') return state;
  return {
    ...state,
    explorationPersistence: {
      ...lifecycle.telemetry(),
      restoredEventCount: recovery?.restoredEventCount ?? lifecycle.telemetry().eventCount,
      recoveredEmpty: recovery?.recoveredEmpty ?? false,
      lastFlushAt,
      lastFlushReason,
      error: flushError,
    },
    landingRecovery: landingRecoveryAnchor.telemetry(),
  };
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const value = priorGet ? priorGet() : currentState;
      return decorate(value);
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      consume(currentState);
    },
  });
}

globalThis.addEventListener?.('greyblue:route-completed', onRouteCompleted);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
globalThis.addEventListener?.('greyblue:approach-challenge', onApproachChallenge);
consume(currentState);

function flushIfDirty(reason) {
  if (!disposed && lifecycle.dirty) flush(reason);
}

globalThis.addEventListener?.('pagehide', () => flushIfDirty('pagehide'));
globalThis.addEventListener?.('beforeunload', () => {
  flushIfDirty('beforeunload');
  disposed = true;
  globalThis.removeEventListener?.('greyblue:route-completed', onRouteCompleted);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  globalThis.removeEventListener?.('greyblue:approach-challenge', onApproachChallenge);
}, { once: true });
document.addEventListener?.('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushIfDirty('hidden');
});
