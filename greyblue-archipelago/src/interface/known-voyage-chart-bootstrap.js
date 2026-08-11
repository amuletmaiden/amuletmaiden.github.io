import { loadGame } from '../core/save.js';
import { buildArchipelago } from '../world/archipelago.js';
import {
  cancelKnownVoyageIntention,
  createKnownVoyageIntentionState,
  publicKnownVoyageIntention,
  selectKnownVoyageIntention,
  stepKnownVoyageIntention,
} from '../core/known-voyage-intention.js';
import { buildKnownVoyageChart } from './known-voyage-chart.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let open = false;
let worldSeed = null;
let world = null;
let lastRenderKey = '';
let voyageState = createKnownVoyageIntentionState();
let completionAnnounced = false;

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

function chartFor(state) {
  const saved = loadGame() ?? {};
  return buildKnownVoyageChart({
    world: worldFor(Number.isInteger(state?.seed) ? state.seed : saved.seed),
    discoveredIslandIds: Array.isArray(state?.discovered) ? state.discovered : saved.discovered,
    discoveredRouteIds: Array.isArray(state?.discoveredRoutes) ? state.discoveredRoutes : saved.discoveredRoutes,
    exploration: saved.exploration,
    currentRegionId: state?.currentRegion?.id ?? null,
  });
}

function privateKnownNodes(chart, state) {
  const saved = loadGame() ?? {};
  const authoredWorld = worldFor(Number.isInteger(state?.seed) ? state.seed : saved.seed);
  const islandsById = new Map((Array.isArray(authoredWorld?.islands) ? authoredWorld.islands : [])
    .map((island) => [cleanId(island?.id), island])
    .filter(([id]) => id));
  return chart.nodes.map((node) => {
    const island = islandsById.get(cleanId(node.id));
    return Object.freeze({ ...node, regionId: cleanId(island?.regionId) });
  }).filter((node) => node.regionId);
}

function recoveryActive(state) {
  return state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery';
}

function restorePublishing(state) {
  return Boolean(state?.restorePublishing || state?.explorationRestorePublishing);
}

function stepVoyage(state) {
  const nearest = state?.nearestIsland;
  const grounded = state?.collision?.grounded === true || state?.flight?.airborne === false;
  const ordinaryFlight = state?.ready === true
    && state?.paused !== true
    && !recoveryActive(state)
    && !restorePublishing(state)
    && Number.isFinite(state?.position?.x)
    && Number.isFinite(state?.position?.y)
    && Number.isFinite(state?.position?.z);

  voyageState = stepKnownVoyageIntention(voyageState, {
    ready: state?.ready === true,
    paused: state?.paused === true,
    recovery: recoveryActive(state),
    restorePublishing: restorePublishing(state),
    currentRegionId: cleanId(state?.currentRegion?.id),
    nearestIslandId: cleanId(nearest?.id),
    airborne: !grounded,
    grounded,
    ordinaryFlight,
    arrivedAtNearestIsland: grounded,
    arrivalReadinessActive: globalThis.__greyblueKnownArrivalReadiness?.active === true,
  });

  const publicState = publicKnownVoyageIntention(voyageState);
  globalThis.__greyblueKnownVoyageIntention = publicState;
  if (publicState.completed && !completionAnnounced) {
    completionAnnounced = true;
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:known-voyage-intention', {
      detail: Object.freeze({ ...publicState, event: 'completed' }),
    }));
  } else if (!publicState.completed) {
    completionAnnounced = false;
  }
  return publicState;
}

const style = document.createElement('style');
style.id = 'greyblue-voyage-chart-style';
style.textContent = `
  #greyblue-voyage-chart-toggle { font:inherit; padding:.28rem .5rem; border:1px solid currentColor; border-radius:.35rem; background:transparent; color:inherit; cursor:pointer; }
  #greyblue-voyage-chart { position:fixed; inset:auto 1.1rem 1.1rem auto; z-index:28; width:min(720px,calc(100vw - 2.2rem)); max-height:min(78vh,680px); overflow:auto; box-sizing:border-box; padding:.85rem; border:1px solid rgba(220,235,240,.5); border-radius:.65rem; background:rgba(12,24,30,.94); color:#e8f0f2; box-shadow:0 14px 42px rgba(0,0,0,.38); backdrop-filter:blur(9px); }
  #greyblue-voyage-chart[hidden] { display:none; }
  .greyblue-voyage-chart-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:.55rem; }
  .greyblue-voyage-chart-heading h2 { margin:0; font-size:1rem; letter-spacing:.04em; font-weight:650; }
  #greyblue-voyage-chart-close { font:inherit; border:0; background:transparent; color:inherit; padding:.25rem .4rem; cursor:pointer; }
  #greyblue-voyage-chart-empty { margin:.7rem 0; opacity:.8; }
  #greyblue-voyage-chart-svg { display:block; width:100%; aspect-ratio:16/9; border-radius:.45rem; background:linear-gradient(180deg,rgba(112,143,154,.08),rgba(112,143,154,.015)); }
  #greyblue-voyage-chart-svg line { stroke:rgba(194,215,220,.35); stroke-width:1.25; vector-effect:non-scaling-stroke; }
  #greyblue-voyage-chart-svg line[data-completed="true"] { stroke:rgba(220,236,240,.7); stroke-width:1.8; }
  #greyblue-voyage-chart-svg circle { fill:#9fb6bd; stroke:#dce9ec; stroke-width:1.2; vector-effect:non-scaling-stroke; cursor:pointer; }
  #greyblue-voyage-chart-svg g[tabindex="0"]:focus circle { stroke-width:4; }
  #greyblue-voyage-chart-svg circle[data-current-region="true"] { fill:#edf6f7; stroke-width:2.5; }
  #greyblue-voyage-chart-svg circle[data-roost="true"] { stroke:#fff; stroke-width:3; }
  #greyblue-voyage-chart-svg circle[data-landmark="true"] { stroke-dasharray:2 1.5; }
  #greyblue-voyage-chart-svg circle[data-selected="true"] { fill:#fff; stroke-width:4; }
  #greyblue-voyage-chart-svg text { fill:#e9f1f3; font:10px system-ui,sans-serif; paint-order:stroke; stroke:rgba(10,20,25,.86); stroke-width:2.4px; stroke-linejoin:round; pointer-events:none; }
  #greyblue-voyage-chart-status { margin:.55rem 0 0; min-height:1.2em; font-size:.9rem; }
  #greyblue-voyage-chart-cancel { margin-left:.45rem; font:inherit; border:1px solid currentColor; border-radius:.35rem; background:transparent; color:inherit; padding:.15rem .4rem; cursor:pointer; }
  #greyblue-voyage-chart-key { margin:.5rem 0 0; font-size:.82rem; opacity:.76; }
  @media (prefers-reduced-motion: no-preference) { #greyblue-voyage-chart { transition:opacity 120ms linear; } }
  @media (prefers-contrast: more) {
    #greyblue-voyage-chart { background:#081116; border-width:2px; }
    #greyblue-voyage-chart-svg line { stroke:#dbe8eb; }
    #greyblue-voyage-chart-svg circle { fill:#fff; stroke:#000; stroke-width:2.2; }
    #greyblue-voyage-chart-svg circle[data-selected="true"] { stroke:#fff; stroke-width:5; }
    #greyblue-voyage-chart-svg text { fill:#fff; stroke:#000; stroke-width:3px; }
    #greyblue-voyage-chart-toggle, #greyblue-voyage-chart-cancel { border-width:2px; }
  }
`;
document.head?.append(style);

const panel = document.createElement('section');
panel.id = 'greyblue-voyage-chart';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Known voyage chart');
panel.innerHTML = `
  <div class="greyblue-voyage-chart-heading">
    <h2>Known voyage chart</h2>
    <button id="greyblue-voyage-chart-close" type="button" aria-label="Close voyage chart">Close</button>
  </div>
  <div id="greyblue-voyage-chart-empty" hidden>No islands have been charted yet.</div>
  <svg id="greyblue-voyage-chart-svg" viewBox="0 0 1000 562" role="img" aria-label="Known islands and passages"></svg>
  <div data-greyblue-voyage-chart-text data-visually-hidden></div>
  <div id="greyblue-voyage-chart-status" role="status" aria-live="polite"></div>
  <p id="greyblue-voyage-chart-key">V opens or closes the chart. Choose any known island to set a voyage; the chart gives no bearing or distance.</p>
`;
document.body.append(panel);

const preferenceRow = document.querySelector('#greyblue-hud-preferences') ?? document.querySelector('#hud');
const toggle = document.createElement('button');
toggle.id = 'greyblue-voyage-chart-toggle';
toggle.type = 'button';
toggle.textContent = 'Chart';
toggle.setAttribute('aria-controls', panel.id);
toggle.setAttribute('aria-keyshortcuts', 'V');
preferenceRow?.append(toggle);

const closeButton = panel.querySelector('#greyblue-voyage-chart-close');
const svg = panel.querySelector('#greyblue-voyage-chart-svg');
const empty = panel.querySelector('#greyblue-voyage-chart-empty');
const textEquivalent = panel.querySelector('[data-greyblue-voyage-chart-text]');
const voyageStatus = panel.querySelector('#greyblue-voyage-chart-status');
const SVG_NS = 'http://www.w3.org/2000/svg';

function addSvg(name, attributes, parent = svg) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.append(node);
  return node;
}

function publish(chart) {
  globalThis.__greyblueVoyageChart = Object.freeze({
    available: chart.available,
    open,
    nodeCount: chart.nodes.length,
    edgeCount: chart.edges.length,
  });
}

function chooseNode(node, chart, state) {
  const knownNodes = privateKnownNodes(chart, state);
  const privateNode = knownNodes.find((candidate) => candidate.id === node.id);
  if (!privateNode) return;
  voyageState = selectKnownVoyageIntention({ state: voyageState, candidate: privateNode, knownNodes });
  completionAnnounced = false;
  lastRenderKey = '';
  render(state);
}

function cancelVoyage() {
  voyageState = cancelKnownVoyageIntention();
  completionAnnounced = false;
  lastRenderKey = '';
  render(currentState);
}

function renderVoyageStatus(publicState) {
  if (!voyageStatus) return;
  voyageStatus.replaceChildren();
  if (publicState.phase === 'idle') {
    voyageStatus.textContent = 'Choose a known island for a self-directed voyage.';
    return;
  }
  const destinationName = voyageState.targetName || 'known island';
  const text = document.createElement('span');
  text.textContent = publicState.completed
    ? `Arrived at ${destinationName}.`
    : `${destinationName} — ${publicState.text}`;
  voyageStatus.append(text);
  if (!publicState.completed) {
    const cancel = document.createElement('button');
    cancel.id = 'greyblue-voyage-chart-cancel';
    cancel.type = 'button';
    cancel.textContent = 'Cancel voyage';
    cancel.addEventListener('click', cancelVoyage, { once: true });
    voyageStatus.append(cancel);
  }
}

function render(state = currentState) {
  if (disposed) return;
  const chart = chartFor(state);
  const publicVoyage = stepVoyage(state);
  const density = document.documentElement.dataset.greyblueHudDensity === 'expanded' ? 'expanded' : 'focused';
  const selectedId = voyageState.targetId || '';
  const key = `${open}|${density}|${selectedId}|${publicVoyage.phase}|${chart.nodes.map((node) => `${node.id}:${node.currentRegion}:${node.roost}:${node.investigatedLandmark}`).join(',')}|${chart.edges.map((edge) => `${edge.id}:${edge.completed}`).join(',')}`;
  if (key === lastRenderKey) {
    publish(chart);
    return;
  }
  lastRenderKey = key;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  empty.hidden = chart.available;
  svg.hidden = !chart.available;
  svg.replaceChildren();

  const byId = new Map(chart.nodes.map((node) => [node.id, node]));
  for (const edge of chart.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    addSvg('line', {
      x1: from.x * 1000,
      y1: from.y * 562,
      x2: to.x * 1000,
      y2: to.y * 562,
      'data-completed': edge.completed,
    });
  }

  for (const node of chart.nodes) {
    const group = addSvg('g', {
      tabindex: 0,
      role: 'button',
      'aria-label': `${node.name}. Set as voyage destination${selectedId === node.id ? '. Selected' : ''}`,
      'aria-pressed': selectedId === node.id ? 'true' : 'false',
    });
    const circle = addSvg('circle', {
      cx: node.x * 1000,
      cy: node.y * 562,
      r: node.roost ? 8 : node.investigatedLandmark ? 7 : 5.5,
      'data-current-region': node.currentRegion,
      'data-roost': node.roost,
      'data-landmark': node.investigatedLandmark,
      'data-selected': selectedId === node.id,
    }, group);
    const title = addSvg('title', {}, circle);
    title.textContent = `${node.name}${node.roost ? ', roost' : ''}${node.investigatedLandmark ? ', investigated landmark' : ''}${selectedId === node.id ? ', voyage destination' : ''}`;
    const labelEligible = density === 'expanded' || node.currentRegion || node.roost || node.investigatedLandmark || selectedId === node.id;
    if (labelEligible) {
      const label = addSvg('text', { x: node.x * 1000 + 11, y: node.y * 562 - 9 }, group);
      label.textContent = node.name;
    }
    group.addEventListener('click', () => chooseNode(node, chart, state));
    group.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      chooseNode(node, chart, state);
    });
  }

  textEquivalent.replaceChildren(...chart.text.map((line) => {
    const item = document.createElement('div');
    item.textContent = line;
    return item;
  }));
  renderVoyageStatus(publicVoyage);
  publish(chart);
}

function setOpen(nextOpen) {
  open = Boolean(nextOpen);
  lastRenderKey = '';
  render(currentState);
  if (open) {
    const selected = svg?.querySelector('g[aria-pressed="true"]');
    (selected || svg?.querySelector('g[tabindex="0"]') || closeButton)?.focus?.({ preventScroll: true });
  } else toggle.focus({ preventScroll: true });
}

function onKeydown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  const editing = target instanceof Element && (target.matches('input,textarea,select,[contenteditable="true"]'));
  if (editing) return;
  if (event.code === 'KeyV') {
    event.preventDefault();
    setOpen(!open);
    return;
  }
  if (event.code === 'Escape' && open) {
    event.preventDefault();
    setOpen(false);
  }
}

function refreshSoon() {
  lastRenderKey = '';
  queueMicrotask(() => render(currentState));
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      render(currentState);
    },
  });
}

const refreshEvents = Object.freeze([
  'greyblue:route-completed',
  'greyblue:landmark-investigated',
  'greyblue:roost-established',
]);
for (const eventName of refreshEvents) globalThis.addEventListener?.(eventName, refreshSoon);
globalThis.addEventListener?.('keydown', onKeydown);
toggle.addEventListener('click', () => setOpen(!open));
closeButton?.addEventListener('click', () => setOpen(false));
globalThis.__greyblueKnownVoyageIntention = publicKnownVoyageIntention(voyageState);
render(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  for (const eventName of refreshEvents) globalThis.removeEventListener?.(eventName, refreshSoon);
  globalThis.removeEventListener?.('keydown', onKeydown);
  panel.remove();
  toggle.remove();
  style.remove();
  delete globalThis.__greyblueVoyageChart;
  delete globalThis.__greyblueKnownVoyageIntention;
}, { once: true });
