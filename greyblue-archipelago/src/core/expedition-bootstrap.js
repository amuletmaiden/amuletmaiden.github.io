import { deriveExpeditionContext, expeditionJournalLine } from './expedition-context.js';
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
let currentContext = Object.freeze({ active: false, phase: 'idle', familiar: false });

const host = document.querySelector('#hud') ?? document.body;
const panel = document.createElement('section');
panel.id = 'greyblue-expedition-intention';
panel.hidden = true;
panel.setAttribute('role', 'status');
panel.setAttribute('aria-live', 'polite');
panel.setAttribute('aria-atomic', 'true');
panel.innerHTML = '<span data-greyblue-expedition-intention></span>';
const intentionNode = panel.querySelector('[data-greyblue-expedition-intention]');
host.append(panel);

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

function publish(context) {
  currentContext = context;
  globalThis.__greyblueExpedition = context;
  const line = expeditionJournalLine(context);
  panel.hidden = !line;
  intentionNode.textContent = line ?? '';
  panel.dataset.phase = context?.phase ?? 'idle';

  const key = JSON.stringify(context);
  if (key === lastPublishedKey) return;
  lastPublishedKey = key;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:expedition-context', {
    detail: Object.freeze({ context, line }),
  }));
}

function recompute(state = currentState) {
  if (disposed || !state || typeof state !== 'object') {
    publish(Object.freeze({ active: false, phase: 'idle', familiar: false }));
    return;
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
}

function recomputeAfterCanonicalEvent() {
  queueMicrotask(() => recompute(currentState));
}

function onCrossingCancelled() {
  cancelled = true;
  recomputeAfterCanonicalEvent();
}

function decorate(state) {
  if (!state || typeof state !== 'object') return state;
  return { ...state, expedition: currentContext };
}

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

globalThis.addEventListener?.('greyblue:route-completed', recomputeAfterCanonicalEvent);
globalThis.addEventListener?.('greyblue:landmark-investigated', recomputeAfterCanonicalEvent);
globalThis.addEventListener?.('greyblue:landmark-flight-encounter', recomputeAfterCanonicalEvent);
globalThis.addEventListener?.('greyblue:roost-established', recomputeAfterCanonicalEvent);
globalThis.addEventListener?.('greyblue:crossing-cancelled', onCrossingCancelled);

recompute(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:route-completed', recomputeAfterCanonicalEvent);
  globalThis.removeEventListener?.('greyblue:landmark-investigated', recomputeAfterCanonicalEvent);
  globalThis.removeEventListener?.('greyblue:landmark-flight-encounter', recomputeAfterCanonicalEvent);
  globalThis.removeEventListener?.('greyblue:roost-established', recomputeAfterCanonicalEvent);
  globalThis.removeEventListener?.('greyblue:crossing-cancelled', onCrossingCancelled);
  panel.remove();
  delete globalThis.__greyblueExpedition;
}, { once: true });
