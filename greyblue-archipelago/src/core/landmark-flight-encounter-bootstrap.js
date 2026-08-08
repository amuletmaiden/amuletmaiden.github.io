import { buildArchipelago } from '../world/archipelago.js';
import {
  completedLandmarkFlightEncounterIdsFromExploration,
  investigatedLandmarkIdsFromExploration,
} from './exploration-lifecycle.js';
import { stepLandmarkFlightEncounter } from './landmark-flight-encounter.js';
import { loadGame } from './save.js';

const restored = loadGame();
const investigatedIds = new Set(investigatedLandmarkIdsFromExploration(restored?.exploration));
const completedIds = new Set(completedLandmarkFlightEncounterIdsFromExploration(restored?.exploration));
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let encounterState = null;
let publicState = Object.freeze({ active: false, encounterClass: null, phase: 'idle', completed: false });
let disposed = false;
let lastRecoveryToken = null;

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function recoveryToken(state) {
  const source = state?.recoverySource ?? state?.collision?.recoverySource ?? null;
  const recovered = state?.recovered === true || state?.collision?.recovered === true || source === 'checkpoint' || source === 'earned-roost';
  if (!recovered) return null;
  const x = Number.isFinite(state?.position?.x) ? Math.round(state.position.x) : 0;
  const z = Number.isFinite(state?.position?.z) ? Math.round(state.position.z) : 0;
  return `${source ?? 'recovered'}:${x}:${z}`;
}

function eligibleLandmarks(state) {
  const discovered = new Set(Array.isArray(state?.discovered) ? state.discovered : []);
  return getWorld(state).islands
    .filter((island) => island?.landmarkRecord?.id)
    .filter((island) => discovered.has(island.id) && investigatedIds.has(island.landmarkRecord.id) && !completedIds.has(island.landmarkRecord.id))
    .map((island) => ({
      id: island.landmarkRecord.id,
      islandId: island.id,
      regionId: island.regionId,
      x: island.x,
      z: island.z,
      radius: island.landmarkRecord.encounter?.triggerRadius,
      encounterClass: island.landmarkRecord.encounter?.class,
      discovered: true,
      investigated: true,
    }));
}

function consume(state) {
  if (disposed || !state?.ready || state?.paused === true) {
    publicState = Object.freeze({ active: false, encounterClass: null, phase: 'idle', completed: false });
    return;
  }

  const token = recoveryToken(state);
  const recovered = Boolean(token && token !== lastRecoveryToken);
  if (token) lastRecoveryToken = token;

  const result = stepLandmarkFlightEncounter({
    landmarks: eligibleLandmarks(state),
    position: state.position,
    speed: state.flight?.speed,
    recovered,
    state: encounterState,
  });
  encounterState = result.state;
  publicState = Object.freeze({
    active: Boolean(result.active),
    encounterClass: result.active?.encounterClass ?? null,
    phase: result.active?.phase ?? 'idle',
    completed: false,
  });

  if (!result.event || completedIds.has(result.event.landmarkId)) return;
  completedIds.add(result.event.landmarkId);
  const occurredAt = Date.now();
  publicState = Object.freeze({
    active: true,
    encounterClass: result.event.encounterClass,
    phase: 'completed',
    completed: true,
  });
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:landmark-flight-encounter', {
    detail: Object.freeze({
      landmarkId: result.event.landmarkId,
      islandId: result.event.islandId,
      regionId: result.event.regionId,
      encounterClass: result.event.encounterClass,
      occurredAt,
      soundHook: `landmark-flight-${result.event.encounterClass}`,
    }),
  }));
}

function decoratedState() {
  const base = priorGet ? priorGet() : currentState;
  if (!base || typeof base !== 'object') return base;
  return { ...base, landmarkFlightEncounter: publicState };
}

function onInvestigated(event) {
  const id = typeof event?.detail?.landmarkId === 'string' ? event.detail.landmarkId.trim().slice(0, 120) : '';
  if (id) investigatedIds.add(id);
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return decoratedState(); },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      consume(currentState);
    },
  });
}

globalThis.addEventListener?.('greyblue:landmark-investigated', onInvestigated);
consume(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:landmark-investigated', onInvestigated);
}, { once: true });
