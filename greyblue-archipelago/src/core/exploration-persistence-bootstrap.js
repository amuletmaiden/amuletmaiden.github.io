import { createExplorationLifecycle } from './exploration-lifecycle.js';
import { masteryFromChallengeEvent } from './approach-mastery.js';
import { createLandingRecoveryAnchor } from './landing-recovery-anchor.js';
import { stepEarnedRoost, planRoostRecovery } from './roost-lifecycle.js';
import { deriveRegionalFlightMemoryEvent } from './regional-flight-memory.js';
import {
  createHighAirLandfallCheckpointState,
  planHighAirLandfallCheckpoint,
} from './high-air-landfall-checkpoint.js';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame, saveGame } from './save.js';
import {
  createExitSavePolicyState,
  planPersistenceFlush,
  rearmExitSavePolicyState,
  truthfulExitSaveState,
} from './exit-save-policy.js';

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
let exitSavePolicy = createExitSavePolicyState();
let highAirLandfallCheckpointPolicy = createHighAirLandfallCheckpointState();
let disposed = false;
let roostDwell = null;
let lastRoostStepAt = performance.now();
let roostRecovery = null;
let worldSeed = null;
let recoveryWorld = null;
let roostAnnouncement = null;
let announcementUntil = 0;

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

function stateForSave(state, { preservePosition = false } = {}) {
  const previous = loadGame() ?? restored ?? {};
  return {
    seed: Number.isInteger(state?.seed) ? state.seed : previous.seed,
    position: preservePosition ? previous.position : state?.position ?? previous.position,
    discovered: Array.isArray(state?.discovered) ? state.discovered : previous.discovered,
    discoveredRoutes: Array.isArray(state?.discoveredRoutes) ? state.discoveredRoutes : previous.discoveredRoutes,
    guidance: guidanceFrom(state, previous.guidance),
    exploration: lifecycle.snapshot(),
    settings: previous.settings ?? {},
  };
}

function flush(reason) {
  const lifecycleDirty = lifecycle.dirty || reason === 'restore-checkpoint' || reason === 'high-air-landfall';
  const plan = planPersistenceFlush({
    policyState: exitSavePolicy,
    reason,
    lifecycleDirty,
    runtimeState: currentState,
  });
  if (!plan.shouldFlush) return false;

  const exitReason = reason === 'pagehide' || reason === 'beforeunload' || reason === 'hidden';
  const preservePosition = exitReason && !truthfulExitSaveState(currentState);
  try {
    const saved = saveGame(stateForSave(currentState, { preservePosition }));
    lifecycle.markFlushed();
    exitSavePolicy = plan.nextPolicyState;
    lastFlushAt = saved.savedAt;
    lastFlushReason = reason;
    flushError = null;
    return true;
  } catch (error) {
    flushError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

function getRecoveryWorld(seed) {
  const nextSeed = Number.isInteger(seed) ? seed : 1337;
  if (!recoveryWorld || worldSeed !== nextSeed) {
    worldSeed = nextSeed;
    recoveryWorld = buildArchipelago({ seed: nextSeed, count: 64, radius: 11000, minGap: 390 });
  }
  return recoveryWorld;
}

function publishRecoveryPlan(state) {
  const plan = planRoostRecovery({
    world: getRecoveryWorld(state?.seed),
    exploration: lifecycle.snapshot(),
    discoveredIslandIds: state?.discovered,
    fallback: { x: 0, y: 160, z: 0 },
  });
  roostRecovery = plan?.source === 'earned-roost' ? plan : null;
  globalThis.__greyblueRoostRecovery = roostRecovery;
}

function ensureRoostAnnouncement() {
  if (roostAnnouncement?.isConnected) return roostAnnouncement;
  const hud = document.querySelector('#hud');
  if (!hud) return null;
  roostAnnouncement = document.createElement('div');
  roostAnnouncement.id = 'greyblue-roost-status';
  roostAnnouncement.setAttribute('role', 'status');
  roostAnnouncement.setAttribute('aria-live', 'polite');
  roostAnnouncement.setAttribute('aria-atomic', 'true');
  roostAnnouncement.hidden = true;
  roostAnnouncement.style.marginTop = '7px';
  roostAnnouncement.style.fontSize = '12px';
  roostAnnouncement.style.color = '#d9e4e6';
  hud.append(roostAnnouncement);
  return roostAnnouncement;
}

function announceRoost(state, event) {
  const node = ensureRoostAnnouncement();
  if (!node) return;
  const name = state?.nearestIsland?.id === event.islandId ? state.nearestIsland?.name : null;
  node.textContent = name ? `Roost established at ${name}.` : 'Roost established.';
  node.hidden = false;
  announcementUntil = performance.now() + 4500;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:roost-established', {
    detail: Object.freeze({ islandId: event.islandId, landingZoneId: event.landingZoneId, islandName: name ?? null, occurredAt: event.occurredAt }),
  }));
}

function stepRoost(state) {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - lastRoostStepAt) / 1000));
  lastRoostStepAt = now;
  const nearest = state?.nearestIsland;
  const result = stepEarnedRoost({
    dwell: roostDwell,
    occurredAt: Date.now(),
    frame: {
      dt,
      grounded: state?.paused !== true && state?.collision?.grounded === true && state?.flight?.airborne !== true,
      island: nearest ? { id: nearest.id } : null,
      landingZone: nearest?.landingZone ?? null,
      discoveredIslandIds: state?.discovered,
      position: state?.position,
    },
  });
  roostDwell = result.dwell;
  if (!result.event) return false;
  if (!lifecycle.recordRoost(result.event.islandId, result.event.landingZoneId, result.event.occurredAt)) return false;
  flush('roost-established');
  publishRecoveryPlan(state);
  announceRoost(state, result.event);
  return true;
}

function consume(state) {
  if (!state || typeof state !== 'object') return;
  let changed = false;
  if (state.ready && state.currentRegion?.id) changed = lifecycle.recordRegion(state.currentRegion, Date.now()) || changed;
  const discovery = state.latestDiscovery;
  if (discovery?.landmark?.id) {
    changed = lifecycle.recordLandmark(discovery.landmark, discovery.regionId ?? state.currentRegion?.id ?? null, discovery.discoveredAt ?? Date.now()) || changed;
  }
  if (changed) flush('discovery');
  landingRecoveryAnchor.consume(state);
  stepRoost(state);
  publishRecoveryPlan(state);
  if (roostAnnouncement && !roostAnnouncement.hidden && performance.now() >= announcementUntil) {
    roostAnnouncement.hidden = true;
    roostAnnouncement.textContent = '';
  }
}

function boundedId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function eventTime(event) {
  return Number.isFinite(event?.detail?.occurredAt) ? Math.max(0, Math.floor(event.detail.occurredAt)) : Date.now();
}

function crossingActive(state) {
  if (globalThis.__greyblueFamiliarCrossing?.active === true || state?.familiarCrossing?.active === true) return true;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function onRouteCompleted(event) {
  if (disposed) return;
  const routeId = boundedId(event?.detail?.routeId);
  if (routeId && lifecycle.recordRouteCompletion(routeId, eventTime(event))) flush('route-completed');
}

function onLandmarkInvestigated(event) {
  if (disposed) return;
  const landmarkId = boundedId(event?.detail?.landmarkId);
  if (!landmarkId) return;
  const regionId = boundedId(event?.detail?.regionId) || null;
  if (lifecycle.recordLandmarkInvestigation(landmarkId, regionId, eventTime(event))) flush('landmark-investigated');
}

function onLandmarkFlightEncounter(event) {
  if (disposed) return;
  const landmarkId = boundedId(event?.detail?.landmarkId);
  const islandId = boundedId(event?.detail?.islandId);
  if (!landmarkId || !islandId) return;
  const regionId = boundedId(event?.detail?.regionId) || null;
  const encounterClass = boundedId(event?.detail?.encounterClass) || null;
  if (lifecycle.recordLandmarkFlightEncounter(landmarkId, islandId, regionId, encounterClass, eventTime(event))) {
    flush('landmark-flight-encounter');
  }
}

function onApproachChallenge(event) {
  if (disposed) return;
  const mastery = masteryFromChallengeEvent({ eventDetail: event?.detail, discoveredIslandIds: currentState?.discovered, approachChallenge: currentState?.approachChallenge });
  if (!mastery) return;
  if (lifecycle.recordApproachMastery(mastery.islandId, mastery.corridorId, Date.now())) {
    flush('approach-mastered');
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:approach-mastered', { detail: Object.freeze({ ...mastery, soundHook: 'approach-mastery' }) }));
  }
}

function onRegionalMysteryThread(event) {
  if (disposed || event?.detail?.active !== true || event?.detail?.recognized !== true) return;
  const regionId = boundedId(event?.detail?.regionId);
  if (!regionId) return;
  if (lifecycle.recordRegionalThreadRecognition(regionId, eventTime(event))) {
    flush('regional-thread-recognized');
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-thread-recognized', {
      detail: Object.freeze({ regionId, occurredAt: eventTime(event) }),
    }));
  }
}

function onKnownLandmarkCircuit(event) {
  if (disposed) return;
  const occurredAt = eventTime(event);
  const memory = deriveRegionalFlightMemoryEvent({
    circuitEvent: event?.detail,
    currentRegionId: currentState?.currentRegion?.id,
    recoveryActive: Boolean(currentState?.collision?.requiresRecovery),
    crossingActive: crossingActive(currentState),
    restorePublishing: Boolean(currentState?.restorePublishing || currentState?.explorationRestorePublishing),
    occurredAt,
  });
  if (!memory) return;
  if (!lifecycle.recordRegionalFlightMemory(memory.regionId, memory.memoryClass, memory.occurredAt)) return;
  flush('regional-flight-memory');
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:regional-flight-memory', {
    detail: Object.freeze({
      active: true,
      remembered: true,
      regionId: memory.regionId,
      memoryClass: memory.memoryClass,
      occurredAt: memory.occurredAt,
      restored: false,
    }),
  }));
}

function onHighAirLandfall(event) {
  if (disposed) return;
  const plan = planHighAirLandfallCheckpoint({
    policyState: highAirLandfallCheckpointPolicy,
    eventDetail: event?.detail,
    runtimeState: currentState,
  });
  highAirLandfallCheckpointPolicy = plan.nextPolicyState;
  if (plan.shouldCheckpoint) flush('high-air-landfall');
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
    earnedRoost: {
      dwell: roostDwell,
      recoverySource: roostRecovery ? 'earned-roost' : 'fallback',
      islandId: roostRecovery?.islandId ?? null,
      landingZoneId: roostRecovery?.zoneId ?? null,
    },
  };
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { const value = priorGet ? priorGet() : currentState; return decorate(value); },
    set(value) { if (priorSet) priorSet(value); currentState = priorGet ? priorGet() : value; consume(currentState); },
  });
}

globalThis.addEventListener?.('greyblue:route-completed', onRouteCompleted);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
globalThis.addEventListener?.('greyblue:landmark-flight-encounter', onLandmarkFlightEncounter);
globalThis.addEventListener?.('greyblue:approach-challenge', onApproachChallenge);
globalThis.addEventListener?.('greyblue:regional-mystery-thread', onRegionalMysteryThread);
globalThis.addEventListener?.('greyblue:known-landmark-circuit', onKnownLandmarkCircuit);
globalThis.addEventListener?.('greyblue:high-air-landfall', onHighAirLandfall);
consume(currentState);
publishRecoveryPlan(currentState ?? restored);

function flushOnLifecycleExit(reason) {
  if (!disposed) flush(reason);
}

function rearmExitSave() {
  if (!disposed) exitSavePolicy = rearmExitSavePolicyState(exitSavePolicy);
}

globalThis.addEventListener?.('pagehide', () => flushOnLifecycleExit('pagehide'));
globalThis.addEventListener?.('pageshow', rearmExitSave);
globalThis.addEventListener?.('beforeunload', () => {
  flushOnLifecycleExit('beforeunload');
  disposed = true;
  globalThis.removeEventListener?.('greyblue:route-completed', onRouteCompleted);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  globalThis.removeEventListener?.('greyblue:landmark-flight-encounter', onLandmarkFlightEncounter);
  globalThis.removeEventListener?.('greyblue:approach-challenge', onApproachChallenge);
  globalThis.removeEventListener?.('greyblue:regional-mystery-thread', onRegionalMysteryThread);
  globalThis.removeEventListener?.('greyblue:known-landmark-circuit', onKnownLandmarkCircuit);
  globalThis.removeEventListener?.('greyblue:high-air-landfall', onHighAirLandfall);
  roostAnnouncement?.remove();
  delete globalThis.__greyblueRoostRecovery;
}, { once: true });
document.addEventListener?.('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnLifecycleExit('hidden');
  else if (document.visibilityState === 'visible') rearmExitSave();
});
