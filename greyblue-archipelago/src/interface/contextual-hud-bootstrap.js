import { deriveContextualHudFocus } from './contextual-hud-focus.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = '';

const hud = document.querySelector('#hud');
const nodes = Object.freeze({
  flight: document.querySelector('#greyblue-flight-instruments'),
  landing: document.querySelector('#greyblue-landing-approach'),
  interaction: document.querySelector('#greyblue-landmark-encounter'),
  crossing: document.querySelector('#greyblue-crossing-objective'),
  guidance: document.querySelector('#greyblue-destination-guidance'),
  expedition: document.querySelector('#greyblue-expedition-intention'),
  journal: document.querySelector('#greyblue-exploration-journal'),
  listening: document.querySelector('#greyblue-listening-pulse'),
  approach: document.querySelector('#greyblue-approach-challenge'),
});

function visible(node) {
  return Boolean(node && node.isConnected && !node.hidden);
}

function densityFromState(state) {
  return state?.settings?.hudDensity === 'expanded' ? 'expanded' : 'focused';
}

function collectSurfaces() {
  return {
    error: Boolean(document.querySelector('#error')?.textContent?.trim()),
    landing: visible(nodes.landing),
    interaction: visible(nodes.interaction),
    crossing: visible(nodes.crossing),
    guidance: visible(nodes.guidance),
    expedition: visible(nodes.expedition),
    journalOpen: visible(nodes.journal),
  };
}

function setDimmed(node, dimmed) {
  if (!node) return;
  if (dimmed) node.dataset.greyblueContextDimmed = 'true';
  else delete node.dataset.greyblueContextDimmed;
}

function render(state = currentState) {
  if (disposed || !hud) return;
  const focus = deriveContextualHudFocus({
    state,
    surfaces: collectSurfaces(),
    density: densityFromState(state),
  });
  const key = `${focus.focus}|${focus.density}|${focus.safety}|${focus.journalOpen}|${focus.dimmedSurfaceIds.join(',')}`;
  if (key === lastKey) return;
  lastKey = key;

  hud.dataset.greyblueHudFocus = focus.focus;
  hud.dataset.greyblueHudDensity = focus.density;
  document.documentElement.dataset.greyblueHudFocus = focus.focus;
  document.documentElement.dataset.greyblueHudDensity = focus.density;

  for (const id of ['flight', 'landing', 'interaction', 'crossing', 'guidance', 'expedition']) {
    setDimmed(nodes[id], focus.dimmedSurfaceIds.includes(id));
  }

  // The journal is explicitly player-controlled. Listening and approach surfaces
  // remain fully legible because they can contain immediate interaction feedback.
  setDimmed(nodes.journal, false);
  setDimmed(nodes.listening, false);
  setDimmed(nodes.approach, false);

  globalThis.__greyblueHudFocus = focus.telemetry;
}

function refreshSoon() {
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

for (const eventName of [
  'greyblue:expedition-context',
  'greyblue:expedition-arrival',
  'greyblue:expedition-culmination',
  'greyblue:route-completed',
  'greyblue:landmark-investigated',
  'greyblue:landmark-flight-encounter',
  'greyblue:crossing-cancelled',
]) globalThis.addEventListener?.(eventName, refreshSoon);

globalThis.addEventListener?.('keydown', refreshSoon);
render(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  for (const eventName of [
    'greyblue:expedition-context',
    'greyblue:expedition-arrival',
    'greyblue:expedition-culmination',
    'greyblue:route-completed',
    'greyblue:landmark-investigated',
    'greyblue:landmark-flight-encounter',
    'greyblue:crossing-cancelled',
    'keydown',
  ]) globalThis.removeEventListener?.(eventName, refreshSoon);
  delete globalThis.__greyblueHudFocus;
}, { once: true });
