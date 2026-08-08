import { buildArchipelago } from '../world/archipelago.js';
import { investigatedLandmarkIdsFromExploration } from './exploration-lifecycle.js';
import { createLandmarkEncounterState, activateLandmarkEncounter } from './landmark-encounter-model.js';
import { evaluateLandmarkFlightApproach } from './landmark-flight-approach.js';
import { loadGame } from './save.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
const restoredExploration = loadGame()?.exploration ?? null;
let encounterState = createLandmarkEncounterState({
  visitedIds: investigatedLandmarkIdsFromExploration(restoredExploration),
});
let encounterView = null;
let approachTelemetry = Object.freeze({ visible: false, status: 'hidden', reason: 'not-ready', shouldInvestigate: false });
let world = null;
let worldSeed = null;
let disposed = false;
let revealTimer = 0;
const lastTriggeredAt = new Map();

const panel = document.createElement('section');
panel.id = 'greyblue-landmark-encounter';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Nearby landmark');
panel.innerHTML = `
  <div data-greyblue-encounter-eyebrow>Nearby landmark</div>
  <strong data-greyblue-encounter-title></strong>
  <div data-greyblue-encounter-status></div>
  <div data-greyblue-encounter-prompt></div>
  <div data-greyblue-encounter-reveal hidden></div>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const titleNode = panel.querySelector('[data-greyblue-encounter-title]');
const statusNode = panel.querySelector('[data-greyblue-encounter-status]');
const promptNode = panel.querySelector('[data-greyblue-encounter-prompt]');
const revealNode = panel.querySelector('[data-greyblue-encounter-reveal]');

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function statusText(view) {
  if (!view?.visible) return '';
  const distance = Number.isFinite(view.distance) ? `${Math.round(view.distance)}m` : 'nearby';
  if (view.status === 'too-low') return `${distance} · climb to ${Math.round(view.minimumAltitude)}m`;
  if (view.status === 'aligned') return `${distance} · approach aligned`;
  if (view.status === 'awakened') return `${distance} · ${view.encounterClass || 'threshold'} awakened`;
  return `${distance} · seek the approach`;
}

function promptText(view) {
  if (!view?.visible) return '';
  if (view.status === 'too-low') return 'Climb through the mist';
  if (view.status === 'aligned') return 'Hold course into the landmark';
  if (view.status === 'awakened') return view.alreadyInvestigated ? 'Encounter remembered' : 'Landmark awakened';
  return 'Find its bearing and approach with speed';
}

function revealEncounter() {
  const result = activateLandmarkEncounter(encounterState, encounterView);
  if (!result.changed || !result.reveal) return false;
  encounterState = result.state;
  const occurredAt = Date.now();
  lastTriggeredAt.set(result.reveal.landmarkId, occurredAt);
  revealNode.hidden = false;
  revealNode.textContent = result.reveal.text;
  announcement.textContent = `${result.reveal.title}. ${result.reveal.text}`;
  promptNode.textContent = 'Encounter remembered';
  panel.dataset.available = 'false';
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:landmark-investigated', {
    detail: {
      landmarkId: result.reveal.landmarkId,
      regionId: currentState?.currentRegion?.id ?? null,
      encounterClass: approachTelemetry?.encounterClass ?? null,
      source: 'flight-approach',
      occurredAt,
    },
  }));
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    if (!disposed) revealNode.hidden = true;
  }, 9000);
  return true;
}

function render(state) {
  if (disposed || !state?.ready) {
    panel.hidden = true;
    encounterView = null;
    approachTelemetry = Object.freeze({ visible: false, status: 'hidden', reason: 'not-ready', shouldInvestigate: false });
    return;
  }

  const investigatedIds = encounterState.visitedIds;
  approachTelemetry = evaluateLandmarkFlightApproach({
    world: getWorld(state),
    discoveredIslandIds: state.discovered,
    investigatedLandmarkIds: investigatedIds,
    position: state.position,
    altitude: state.position?.y,
    heading: state.flight?.yaw,
    forwardSpeed: state.flight?.speed,
    lastTriggeredAt: encounterView?.landmarkId ? lastTriggeredAt.get(encounterView.landmarkId) ?? null : null,
  });

  if (!approachTelemetry.visible) {
    panel.hidden = true;
    encounterView = null;
    return;
  }

  encounterView = Object.freeze({
    visible: true,
    available: approachTelemetry.shouldInvestigate,
    visited: approachTelemetry.alreadyInvestigated,
    landmarkId: approachTelemetry.landmarkId,
    islandId: approachTelemetry.islandId,
    title: approachTelemetry.title,
    encounterClass: approachTelemetry.encounterClass,
    distance: approachTelemetry.distance,
    minimumAltitude: approachTelemetry.minimumAltitude,
    prompt: promptText(approachTelemetry),
    status: statusText(approachTelemetry),
    reveal: null,
    revealText: approachTelemetry.revealText,
  });

  panel.hidden = false;
  titleNode.textContent = encounterView.title;
  statusNode.textContent = encounterView.status;
  promptNode.textContent = encounterView.prompt;
  panel.dataset.encounterClass = encounterView.encounterClass || 'threshold';
  panel.dataset.available = encounterView.available ? 'true' : 'false';
  panel.dataset.flightStatus = approachTelemetry.status;

  if (approachTelemetry.shouldInvestigate) revealEncounter();
}

function decoratedState() {
  const base = priorGet ? priorGet() : currentState;
  if (!base || typeof base !== 'object') return base;
  return { ...base, landmarkFlightApproach: approachTelemetry };
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      return decoratedState();
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      render(currentState);
    },
  });
}

render(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (revealTimer) clearTimeout(revealTimer);
  panel.remove();
  announcement.remove();
}, { once: true });
