import { loadGame } from '../core/save.js';
import { buildArchipelago } from '../world/archipelago.js';
import {
  addKnownVoyageItineraryStop,
  advanceKnownVoyageItinerary,
  cancelKnownVoyageItinerary,
  createKnownVoyageItineraryState,
  currentKnownVoyageItineraryStop,
  launchKnownVoyageItinerary,
  publicKnownVoyageItinerary,
  removeKnownVoyageItineraryStop,
  resetKnownVoyageItineraryForInterruption,
  reverseKnownVoyageItinerary,
} from '../core/known-voyage-itinerary.js';
import { buildKnownVoyageChart } from './known-voyage-chart.js';

const panel = document.querySelector('#greyblue-voyage-chart');
const svg = document.querySelector('#greyblue-voyage-chart-svg');
const voyageStatus = document.querySelector('#greyblue-voyage-chart-status');
if (!panel || !svg || !voyageStatus) throw new Error('Known voyage chart must load before itinerary composition');

let itineraryState = createKnownVoyageItineraryState();
let planning = false;
let activatingLeg = false;
let worldSeed = null;
let world = null;
let disposed = false;

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function worldFor(seed) {
  const nextSeed = Number.isInteger(seed) ? seed : 1337;
  if (!world || worldSeed !== nextSeed) {
    worldSeed = nextSeed;
    world = buildArchipelago({ seed: nextSeed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function currentRuntimeState() {
  return globalThis.__greyblueState ?? null;
}

function chartAndPrivateNodes() {
  const state = currentRuntimeState();
  const saved = loadGame() ?? {};
  const authoredWorld = worldFor(Number.isInteger(state?.seed) ? state.seed : saved.seed);
  const chart = buildKnownVoyageChart({
    world: authoredWorld,
    discoveredIslandIds: Array.isArray(state?.discovered) ? state.discovered : saved.discovered,
    discoveredRouteIds: Array.isArray(state?.discoveredRoutes) ? state.discoveredRoutes : saved.discoveredRoutes,
    exploration: saved.exploration,
    currentRegionId: state?.currentRegion?.id ?? null,
  });
  const islandsById = new Map((Array.isArray(authoredWorld?.islands) ? authoredWorld.islands : [])
    .map((island) => [cleanId(island?.id), island])
    .filter(([id]) => id));
  const knownNodes = chart.nodes.map((node) => {
    const island = islandsById.get(cleanId(node.id));
    return Object.freeze({ ...node, regionId: cleanId(island?.regionId) });
  }).filter((node) => node.regionId);
  return { chart, knownNodes };
}

const style = document.createElement('style');
style.id = 'greyblue-known-voyage-itinerary-style';
style.textContent = `
  #greyblue-known-voyage-itinerary { margin:.55rem 0 0; padding:.55rem .6rem; border:1px solid rgba(220,235,240,.28); border-radius:.45rem; }
  #greyblue-known-voyage-itinerary p { margin:.25rem 0; }
  #greyblue-known-voyage-itinerary-controls { display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.4rem; }
  #greyblue-known-voyage-itinerary button { font:inherit; border:1px solid currentColor; border-radius:.35rem; background:transparent; color:inherit; padding:.18rem .42rem; cursor:pointer; }
  #greyblue-known-voyage-itinerary button:disabled { opacity:.42; cursor:default; }
  #greyblue-voyage-chart-svg circle[data-itinerary-order="1"] { stroke-width:4; }
  #greyblue-voyage-chart-svg circle[data-itinerary-order="2"] { stroke-width:3; stroke-dasharray:4 2; }
  @media (prefers-contrast: more) {
    #greyblue-known-voyage-itinerary { border-width:2px; }
    #greyblue-known-voyage-itinerary button { border-width:2px; }
  }
`;
document.head?.append(style);

const box = document.createElement('section');
box.id = 'greyblue-known-voyage-itinerary';
box.setAttribute('aria-label', 'Known island itinerary');
box.innerHTML = `
  <p id="greyblue-known-voyage-itinerary-status" role="status" aria-live="polite"></p>
  <div id="greyblue-known-voyage-itinerary-controls">
    <button type="button" data-action="plan">Plan two stops</button>
    <button type="button" data-action="reverse">Reverse</button>
    <button type="button" data-action="launch">Launch itinerary</button>
    <button type="button" data-action="cancel">Clear itinerary</button>
  </div>
`;
voyageStatus.insertAdjacentElement('afterend', box);

const status = box.querySelector('#greyblue-known-voyage-itinerary-status');
const planButton = box.querySelector('[data-action="plan"]');
const reverseButton = box.querySelector('[data-action="reverse"]');
const launchButton = box.querySelector('[data-action="launch"]');
const cancelButton = box.querySelector('[data-action="cancel"]');

function publish() {
  globalThis.__greyblueKnownVoyageItinerary = publicKnownVoyageItinerary(itineraryState);
}

function markNodes() {
  const groups = [...svg.querySelectorAll('g[role="button"]')];
  const { chart } = chartAndPrivateNodes();
  const orderById = new Map(itineraryState.stops.map((stop, index) => [stop.id, index + 1]));
  groups.forEach((group, index) => {
    const node = chart.nodes[index];
    const order = node ? orderById.get(node.id) : null;
    const circle = group.querySelector('circle');
    if (circle) {
      if (order) circle.dataset.itineraryOrder = String(order);
      else delete circle.dataset.itineraryOrder;
    }
    const original = group.dataset.itineraryBaseLabel || group.getAttribute('aria-label') || '';
    if (!group.dataset.itineraryBaseLabel) group.dataset.itineraryBaseLabel = original;
    group.setAttribute('aria-label', order ? `${original}. Itinerary stop ${order}` : original);
  });
}

function render() {
  if (disposed) return;
  const publicState = publicKnownVoyageItinerary(itineraryState);
  const names = itineraryState.stops.map((stop, index) => `${index + 1}. ${stop.name}`);
  if (publicState.phase === 'complete') status.textContent = 'Itinerary complete.';
  else if (publicState.phase === 'first-leg' || publicState.phase === 'second-leg') {
    const current = currentKnownVoyageItineraryStop(itineraryState);
    status.textContent = current ? `Current stop: ${current.name}. ${names.join(' · ')}` : names.join(' · ');
  } else if (planning) status.textContent = names.length ? `Planning: ${names.join(' · ')}. Activate a marked stop again to remove it.` : 'Planning: activate one or two known islands.';
  else if (names.length) status.textContent = `Itinerary: ${names.join(' · ')}.`;
  else status.textContent = 'Optional: plan up to two known islands.';

  planButton.textContent = publicState.active ? 'Replace itinerary' : planning ? 'Stop planning' : 'Plan two stops';
  reverseButton.disabled = publicState.active || itineraryState.stops.length !== 2;
  launchButton.disabled = publicState.active || itineraryState.completed || itineraryState.stops.length < 1;
  cancelButton.disabled = itineraryState.stops.length < 1 && !publicState.active && !itineraryState.completed;
  markNodes();
  publish();
}

function groupForStop(stop) {
  if (!stop) return null;
  const { chart } = chartAndPrivateNodes();
  const index = chart.nodes.findIndex((node) => node.id === stop.id);
  if (index < 0) return null;
  return [...svg.querySelectorAll('g[role="button"]')][index] ?? null;
}

function activateCurrentLeg() {
  const stop = currentKnownVoyageItineraryStop(itineraryState);
  const group = groupForStop(stop);
  if (!stop || !group) {
    itineraryState = cancelKnownVoyageItinerary();
    render();
    return false;
  }
  activatingLeg = true;
  try {
    group.click();
  } finally {
    activatingLeg = false;
  }
  render();
  return true;
}

function togglePlannedNode(group) {
  const groups = [...svg.querySelectorAll('g[role="button"]')];
  const index = groups.indexOf(group);
  const { chart, knownNodes } = chartAndPrivateNodes();
  const node = chart.nodes[index];
  if (!node) return;
  const existing = itineraryState.stops.find((stop) => stop.id === node.id);
  itineraryState = existing
    ? removeKnownVoyageItineraryStop(itineraryState, node.id)
    : addKnownVoyageItineraryStop({ state: itineraryState, candidate: node, knownNodes });
  render();
}

function interceptChartActivation(event) {
  if (disposed) return;
  const group = event.target instanceof Element ? event.target.closest('g[role="button"]') : null;
  if (!group || !svg.contains(group)) return;
  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
  const active = publicKnownVoyageItinerary(itineraryState).active;
  if (active && !planning && !activatingLeg) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!planning) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  togglePlannedNode(group);
}

function onPlan() {
  const publicState = publicKnownVoyageItinerary(itineraryState);
  if (publicState.active || itineraryState.completed) {
    itineraryState = cancelKnownVoyageItinerary();
    document.querySelector('#greyblue-voyage-chart-cancel')?.click();
    planning = true;
  } else planning = !planning;
  render();
}

function onReverse() {
  itineraryState = reverseKnownVoyageItinerary(itineraryState);
  render();
}

function onLaunch() {
  const next = launchKnownVoyageItinerary(itineraryState);
  if (next === itineraryState) return;
  itineraryState = next;
  planning = false;
  activateCurrentLeg();
}

function onCancel() {
  itineraryState = cancelKnownVoyageItinerary();
  planning = false;
  document.querySelector('#greyblue-voyage-chart-cancel')?.click();
  render();
}

function onVoyageCompletion(event) {
  if (!publicKnownVoyageItinerary(itineraryState).active) return;
  const before = itineraryState;
  itineraryState = advanceKnownVoyageItinerary(itineraryState, event?.detail);
  if (itineraryState === before) return;
  render();
  if (publicKnownVoyageItinerary(itineraryState).active) queueMicrotask(activateCurrentLeg);
}

function applyInterruption(state) {
  const next = resetKnownVoyageItineraryForInterruption(itineraryState, {
    recovery: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
  });
  if (next === itineraryState) return;
  itineraryState = next;
  planning = false;
  render();
}

const stateDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const stateGet = typeof stateDescriptor?.get === 'function' ? stateDescriptor.get.bind(globalThis) : null;
const stateSet = typeof stateDescriptor?.set === 'function' ? stateDescriptor.set.bind(globalThis) : null;
if (!stateDescriptor || stateDescriptor.configurable) {
  let fallbackState = stateGet ? stateGet() : globalThis.__greyblueState ?? null;
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return stateGet ? stateGet() : fallbackState; },
    set(value) {
      if (stateSet) stateSet(value);
      else fallbackState = value;
      applyInterruption(stateGet ? stateGet() : fallbackState);
      queueMicrotask(render);
    },
  });
}

svg.addEventListener('click', interceptChartActivation, true);
svg.addEventListener('keydown', interceptChartActivation, true);
planButton.addEventListener('click', onPlan);
reverseButton.addEventListener('click', onReverse);
launchButton.addEventListener('click', onLaunch);
cancelButton.addEventListener('click', onCancel);
globalThis.addEventListener?.('greyblue:known-voyage-intention', onVoyageCompletion);

publish();
render();

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  svg.removeEventListener('click', interceptChartActivation, true);
  svg.removeEventListener('keydown', interceptChartActivation, true);
  globalThis.removeEventListener?.('greyblue:known-voyage-intention', onVoyageCompletion);
  box.remove();
  style.remove();
  delete globalThis.__greyblueKnownVoyageItinerary;
}, { once: true });
