const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let open = false;
let lastDiscoveryKey = null;
const discoveries = [];

const panel = document.createElement('section');
panel.id = 'greyblue-exploration-journal';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Exploration journal');
panel.innerHTML = `
  <div class="greyblue-journal-heading">Exploration journal</div>
  <div data-greyblue-journal-objective></div>
  <div data-greyblue-journal-context></div>
  <ol data-greyblue-journal-discoveries></ol>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const objectiveNode = panel.querySelector('[data-greyblue-journal-objective]');
const contextNode = panel.querySelector('[data-greyblue-journal-context]');
const discoveriesNode = panel.querySelector('[data-greyblue-journal-discoveries]');

function finiteDistance(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function discoveryKey(discovery) {
  if (!discovery || typeof discovery !== 'object') return null;
  const id = discovery.islandId ?? discovery.routeId ?? discovery.landmark?.id ?? discovery.name ?? null;
  if (!id) return null;
  return `${id}:${discovery.discoveredAt ?? ''}`;
}

function discoveryLabel(discovery) {
  if (!discovery || typeof discovery !== 'object') return null;
  if (discovery.landmark?.name) return `Landmark found: ${discovery.landmark.name}`;
  if (discovery.name) return `Discovered ${discovery.name}`;
  if (discovery.routeId) return `Route discovered: ${discovery.routeId}`;
  if (discovery.islandId) return `Island discovered: ${discovery.islandId}`;
  return null;
}

function objectiveFor(state) {
  const route = state?.routeGuidance;
  if (route?.destinationName) return `Cross toward ${route.destinationName}.`;
  const nearest = state?.nearestIsland;
  const discovered = Array.isArray(state?.discovered) ? state.discovered : [];
  if (nearest?.id && !discovered.includes(nearest.id)) return `Survey ${nearest.name ?? nearest.id}.`;
  if (state?.currentRegion?.name) return `Search ${state.currentRegion.name} for another route or landmark.`;
  return 'Fly into the mist and find a landmark.';
}

function contextFor(state) {
  const parts = [];
  if (state?.currentRegion?.name) parts.push(state.currentRegion.name);
  const nearest = state?.nearestIsland;
  const distance = finiteDistance(nearest?.distance);
  if (nearest?.name && distance !== null) parts.push(`${nearest.name} · ${distance}m`);
  const isleCount = Number.isFinite(state?.discoveredCount) ? state.discoveredCount : 0;
  const routeCount = Number.isFinite(state?.discoveredRouteCount) ? state.discoveredRouteCount : 0;
  parts.push(`${isleCount} isles · ${routeCount} routes found`);
  return parts.join(' · ');
}

function recordDiscovery(state) {
  const discovery = state?.latestDiscovery;
  const key = discoveryKey(discovery);
  if (!key || key === lastDiscoveryKey) return;
  const label = discoveryLabel(discovery);
  lastDiscoveryKey = key;
  if (!label) return;
  discoveries.unshift(label);
  if (discoveries.length > 5) discoveries.length = 5;
  announcement.textContent = label;
}

function render(state) {
  if (disposed) return;
  recordDiscovery(state);
  objectiveNode.textContent = objectiveFor(state);
  contextNode.textContent = contextFor(state);
  discoveriesNode.replaceChildren(...discoveries.map((label) => {
    const item = document.createElement('li');
    item.textContent = label;
    return item;
  }));
  panel.hidden = !open;
  panel.dataset.journalState = open ? 'open' : 'closed';
}

function setOpen(nextOpen) {
  open = Boolean(nextOpen);
  render(currentState);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyJ' && !event.repeat) {
    setOpen(!open);
    return;
  }
  if (event.code === 'Escape' && open) setOpen(false);
}

globalThis.addEventListener?.('keydown', onKeyDown);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      return priorGet ? priorGet() : currentState;
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
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  announcement.remove();
}, { once: true });
