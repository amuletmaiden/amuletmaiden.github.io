import { deriveExpeditionContext, expeditionJournalLine } from './expedition-context.js';
import {
  deriveExpeditionArrivalConsequence,
  expeditionArrivalCooldown,
  expeditionArrivalLine,
  idleExpeditionArrivalConsequence,
} from './expedition-arrival-consequence.js';
import {
  deriveExpeditionCulmination,
  expeditionCulminationLine,
  idleExpeditionCulmination,
  publicExpeditionCulmination,
} from './expedition-culmination.js';
import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let disposed = false;
let cancelled = false;
let lastSelectedRouteId = null;
let lastPublishedKey = '';
let lastArrivalKey = '';
let lastCulminationKey = '';
let arrivalTimer = 0;
let cooldownTimer = 0;
let culminationTimer = 0;
let currentContext = Object.freeze({ active: false, phase: 'idle', familiar: false });
let currentArrival = idleExpeditionArrivalConsequence();
let currentCulmination = idleExpeditionCulmination();

const host = document.querySelector('#hud') ?? document.body;
const panel = document.createElement('section');
panel.id = 'greyblue-expedition-intention';
panel.hidden = true;
panel.setAttribute('role', 'status');
panel.setAttribute('aria-live', 'polite');
panel.setAttribute('aria-atomic', 'true');
panel.innerHTML = '<span data-greyblue-expedition-intention></span><span data-greyblue-expedition-arrival></span><span data-greyblue-expedition-culmination></span>';
const intentionNode = panel.querySelector('[data-greyblue-expedition-intention]');
const arrivalNode = panel.querySelector('[data-greyblue-expedition-arrival]');
const culminationNode = panel.querySelector('[data-greyblue-expedition-culmination]');
host.append(panel);

function reducedMotionPreferred() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function canonicalExploration() {
  const restored = loadGame();
  return restored?.exploration && typeof restored.exploration === 'object'
    ? restored.exploration
    : { events: [] };
}

function knownDeparture(state) {
  const routeDeparture = typeof state?.routeChoice?.departureIslandId === 'string'
    ? state.routeChoice.departureIslandId
    : null;
  if (routeDeparture) return routeDeparture;
  if (Number.isFinite(state?.nearestIsland?.distance) && state.nearestIsland.distance <= 320) {
    return state.nearestIsland?.id ?? null;
  }
  return null;
}

function routeIdentity(state) {
  return typeof state?.guidancePreference === 'string' && state.guidancePreference
    ? state.guidancePreference
    : null;
}

function isCommitted(state, routeId) {
  if (!routeId) return null;
  if (state?.routeChoice?.reason === 'active-crossing') return routeId;
  const progress = Number(state?.routeGuidance?.progress);
  return Number.isFinite(progress) && progress >= 0.1 ? routeId : null;
}

function expectedDestination(context, state = currentState) {
  const islandId = typeof context?.destinationIslandId === 'string' ? context.destinationIslandId : '';
  if (!islandId || !Array.isArray(state?.discovered) || !state.discovered.includes(islandId)) return null;
  const island = getWorld(state)?.islands?.find((candidate) => candidate?.id === islandId);
  if (!island) return null;
  const landmarkId = typeof island.landmarkRecord?.id === 'string' ? island.landmarkRecord.id : null;
  return Object.freeze({ islandId, landmarkId });
}

function renderPanel(context = currentContext, arrival = currentArrival, culmination = currentCulmination) {
  const line = expeditionJournalLine(context);
  const arrivalLine = expeditionArrivalLine(arrival);
  const culminationLine = expeditionCulminationLine(culmination);
  intentionNode.textContent = line ?? '';
  arrivalNode.textContent = arrivalLine ?? '';
  culminationNode.textContent = culminationLine ?? '';
  arrivalNode.hidden = !arrivalLine;
  culminationNode.hidden = !culminationLine;
  panel.hidden = !line && !arrivalLine && !culminationLine;
  panel.dataset.phase = context?.phase ?? 'idle';
  panel.dataset.arrivalPhase = arrival?.phase ?? 'idle';
  panel.dataset.culminationPhase = culmination?.phase ?? 'idle';
  if (arrival?.class) panel.dataset.arrivalClass = arrival.class;
  else delete panel.dataset.arrivalClass;
  if (culmination?.class) panel.dataset.culminationClass = culmination.class;
  else delete panel.dataset.culminationClass;
  return { line, arrivalLine, culminationLine };
}

function publish(context) {
  currentContext = context;
  globalThis.__greyblueExpedition = context;
  const { line } = renderPanel();

  const key = JSON.stringify(context);
  if (key === lastPublishedKey) return;
  lastPublishedKey = key;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:expedition-context', {
    detail: Object.freeze({ context, line }),
  }));
}

function publishArrival(arrival) {
  currentArrival = arrival;
  globalThis.__greyblueExpeditionArrival = arrival;
  renderPanel();
}

function publishCulmination(culmination) {
  currentCulmination = publicExpeditionCulmination(culmination);
  globalThis.__greyblueExpeditionCulmination = currentCulmination;
  const { culminationLine } = renderPanel();
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:expedition-culmination', {
    detail: Object.freeze({
      ...currentCulmination,
      consequenceClass: currentCulmination.class ?? null,
      line: culminationLine,
    }),
  }));
}

function clearArrivalTimers() {
  if (arrivalTimer) clearTimeout(arrivalTimer);
  if (cooldownTimer) clearTimeout(cooldownTimer);
  arrivalTimer = 0;
  cooldownTimer = 0;
}

function clearCulminationTimer() {
  if (culminationTimer) clearTimeout(culminationTimer);
  culminationTimer = 0;
}

function beginArrivalConsequence(consequence) {
  if (!consequence?.active || disposed) return false;
  const key = `${consequence.routeId}:${consequence.class}`;
  if (key === lastArrivalKey) return false;
  lastArrivalKey = key;
  clearArrivalTimers();
  publishArrival(consequence);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:expedition-arrival', {
    detail: Object.freeze({
      routeId: consequence.routeId,
      consequenceClass: consequence.class,
      phase: consequence.phase,
    }),
  }));
  arrivalTimer = setTimeout(() => {
    arrivalTimer = 0;
    const cooldown = expeditionArrivalCooldown(consequence);
    publishArrival(cooldown);
    cooldownTimer = setTimeout(() => {
      cooldownTimer = 0;
      publishArrival(idleExpeditionArrivalConsequence());
    }, cooldown.cooldownMs ?? 1200);
  }, consequence.durationMs ?? 3200);
  return true;
}

function beginCulmination(culmination) {
  if (!culmination?.active || disposed || !culmination.claimKey) return false;
  if (culmination.claimKey === lastCulminationKey) return false;
  lastCulminationKey = culmination.claimKey;
  clearCulminationTimer();
  publishCulmination(culmination);
  culminationTimer = setTimeout(() => {
    culminationTimer = 0;
    publishCulmination(idleExpeditionCulmination());
  }, culmination.durationMs ?? 4600);
  return true;
}

function recompute(state = currentState) {
  if (disposed || !state || typeof state !== 'object') {
    publish(Object.freeze({ active: false, phase: 'idle', familiar: false }));
    return currentContext;
  }

  const selectedRouteId = routeIdentity(state);
  if (selectedRouteId && selectedRouteId !== lastSelectedRouteId) cancelled = false;
  lastSelectedRouteId = selectedRouteId;
  if (state?.routeChoice?.reason === 'active-crossing') cancelled = false;

  const context = deriveExpeditionContext({
    world: getWorld(state),
    exploration: canonicalExploration(),
    discoveredIslandIds: state.discovered,
    discoveredRouteIds: state.discoveredRoutes,
    currentIslandId: knownDeparture(state),
    currentRegionId: state.currentRegion?.id ?? null,
    selectedRouteId,
    committedRouteId: isCommitted(state, selectedRouteId),
    recoveryActive: Boolean(state?.collision?.requiresRecovery),
    cancelled,
  });
  publish(context);
  return context;
}

function recomputeAfterCanonicalEvent() {
  queueMicrotask(() => recompute(currentState));
}

function culminationAfterEvent(eventKind, event, before, destination, after = null) {
  const eventDetail = event?.detail && typeof event.detail === 'object' ? { ...event.detail } : null;
  const culmination = deriveExpeditionCulmination({
    before,
    after,
    eventKind,
    eventDetail,
    exploration: canonicalExploration(),
    expectedDestination: destination,
    currentRegionId: currentState?.currentRegion?.id ?? null,
    reducedMotion: reducedMotionPreferred(),
  });
  beginCulmination(culmination);
}

function onRouteCompleted(event) {
  const before = currentContext;
  const destination = expectedDestination(before);
  const completion = event?.detail && typeof event.detail === 'object' ? { ...event.detail } : null;
  queueMicrotask(() => {
    const after = recompute(currentState);
    const consequence = deriveExpeditionArrivalConsequence({
      before,
      after,
      completion,
      reducedMotion: reducedMotionPreferred(),
    });
    beginArrivalConsequence(consequence);
    culminationAfterEvent('route-completed', event, before, destination, after);
  });
}

function onLandmarkEvent(kind, event) {
  const before = currentContext;
  const destination = expectedDestination(before);
  queueMicrotask(() => {
    const after = recompute(currentState);
    culminationAfterEvent(kind, event, before, destination, after);
  });
}

function onRoostEstablished(event) {
  const before = currentContext;
  const destination = expectedDestination(before);
  queueMicrotask(() => {
    const after = recompute(currentState);
    culminationAfterEvent('roost-established', event, before, destination, after);
  });
}

function onCrossingCancelled() {
  cancelled = true;
  recomputeAfterCanonicalEvent();
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code !== 'KeyX' || currentContext?.phase !== 'crossing') return;
  onCrossingCancelled();
}

function decorate(state) {
  if (!state || typeof state !== 'object') return state;
  return {
    ...state,
    expedition: currentContext,
    expeditionArrival: currentArrival,
    expeditionCulmination: currentCulmination,
  };
}

const onLandmarkInvestigated = (event) => onLandmarkEvent('landmark-investigated', event);
const onLandmarkFlightEncounter = (event) => onLandmarkEvent('landmark-flight-encounter', event);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return decorate(priorGet ? priorGet() : currentState); },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      recompute(currentState);
    },
  });
}

globalThis.addEventListener?.('greyblue:route-completed', onRouteCompleted);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
globalThis.addEventListener?.('greyblue:landmark-flight-encounter', onLandmarkFlightEncounter);
globalThis.addEventListener?.('greyblue:roost-established', onRoostEstablished);
globalThis.addEventListener?.('greyblue:crossing-cancelled', onCrossingCancelled);
globalThis.addEventListener?.('keydown', onKeyDown);

recompute(currentState);
publishArrival(currentArrival);
publishCulmination(currentCulmination);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  clearArrivalTimers();
  clearCulminationTimer();
  globalThis.removeEventListener?.('greyblue:route-completed', onRouteCompleted);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
  globalThis.removeEventListener?.('greyblue:landmark-flight-encounter', onLandmarkFlightEncounter);
  globalThis.removeEventListener?.('greyblue:roost-established', onRoostEstablished);
  globalThis.removeEventListener?.('greyblue:crossing-cancelled', onCrossingCancelled);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  delete globalThis.__greyblueExpedition;
  delete globalThis.__greyblueExpeditionArrival;
  delete globalThis.__greyblueExpeditionCulmination;
}, { once: true });