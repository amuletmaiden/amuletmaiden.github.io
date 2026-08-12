import { deriveContextualHudFocus } from './contextual-hud-focus.js';
import { loadGame, saveSettingsPatch } from '../core/save.js';
import {
  controlHintForSource,
  deriveHudPreferenceState,
  normalizeHudInputSource,
  toggleHudDensity,
} from './hud-preferences.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = '';
let preference = deriveHudPreferenceState({ settings: loadGame()?.settings });

const hud = document.querySelector('#hud');
const nodes = Object.freeze({
  flight: document.querySelector('#greyblue-flight-instruments'),
  landing: document.querySelector('#greyblue-landing-approach'),
  corridor: document.querySelector('#greyblue-landing-corridor-readback'),
  interaction: document.querySelector('#greyblue-landmark-encounter'),
  crossing: document.querySelector('#greyblue-crossing-objective'),
  guidance: document.querySelector('#greyblue-destination-guidance'),
  expedition: document.querySelector('#greyblue-expedition-intention'),
  journal: document.querySelector('#greyblue-exploration-journal'),
  listening: document.querySelector('#greyblue-listening-pulse'),
  approach: document.querySelector('#greyblue-approach-challenge'),
});

const style = document.createElement('style');
style.id = 'greyblue-contextual-hud-style';
style.textContent = `
  #hud [data-greyblue-context-dimmed="true"] { opacity:.42; filter:saturate(.72); }
  #hud [data-greyblue-context-dimmed="true"] [data-visually-hidden] { opacity:1; filter:none; }
  #hud[data-greyblue-hud-density="expanded"] [data-greyblue-context-dimmed="true"] { opacity:1; filter:none; }
  #greyblue-hud-preferences { display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; margin:.35rem 0; }
  #greyblue-hud-density-toggle { font:inherit; padding:.28rem .5rem; border:1px solid currentColor; border-radius:.35rem; background:transparent; color:inherit; cursor:pointer; }
  #greyblue-hud-control-hint { opacity:.78; font-size:.88em; }
  @media (prefers-reduced-motion: no-preference) {
    #hud > section { transition:opacity 120ms linear,filter 120ms linear; }
  }
  @media (prefers-contrast: more) {
    #hud [data-greyblue-context-dimmed="true"] { opacity:.68; filter:none; }
    #greyblue-hud-density-toggle { border-width:2px; }
  }
`;
document.head?.append(style);

const preferenceRow = document.createElement('div');
preferenceRow.id = 'greyblue-hud-preferences';
preferenceRow.setAttribute('role', 'group');
preferenceRow.setAttribute('aria-label', 'Flight interface preferences');
const densityToggle = document.createElement('button');
densityToggle.id = 'greyblue-hud-density-toggle';
densityToggle.type = 'button';
const controlHint = document.createElement('span');
controlHint.id = 'greyblue-hud-control-hint';
controlHint.setAttribute('aria-live', 'polite');
preferenceRow.append(densityToggle, controlHint);
hud?.prepend(preferenceRow);

function visible(node) {
  return Boolean(node && node.isConnected && !node.hidden);
}

function collectSurfaces() {
  return {
    error: Boolean(document.querySelector('#error')?.textContent?.trim()),
    landing: visible(nodes.landing) || visible(nodes.corridor),
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

function updatePreferenceFromState(state) {
  const source = normalizeHudInputSource(state?.input?.source);
  if (source === preference.inputSource) return;
  preference = deriveHudPreferenceState({
    settings: { hudDensity: preference.density },
    inputSource: source,
  });
}

function render(state = currentState) {
  if (disposed || !hud) return;
  updatePreferenceFromState(state);
  const focus = deriveContextualHudFocus({
    state,
    surfaces: collectSurfaces(),
    density: preference.density,
  });
  const key = `${focus.focus}|${focus.density}|${focus.safety}|${focus.journalOpen}|${focus.dimmedSurfaceIds.join(',')}|${preference.inputSource}|${visible(nodes.corridor)}`;
  if (key === lastKey) return;
  lastKey = key;

  hud.dataset.greyblueHudFocus = focus.focus;
  hud.dataset.greyblueHudDensity = focus.density;
  document.documentElement.dataset.greyblueHudFocus = focus.focus;
  document.documentElement.dataset.greyblueHudDensity = focus.density;

  for (const id of ['flight', 'landing', 'interaction', 'crossing', 'guidance', 'expedition']) {
    setDimmed(nodes[id], focus.dimmedSurfaceIds.includes(id));
  }
  setDimmed(nodes.corridor, focus.dimmedSurfaceIds.includes('landing'));

  // Journal control stays wholly with the player. Listening and approach panels can
  // carry immediate interaction feedback, so focus never visually suppresses them.
  setDimmed(nodes.journal, false);
  setDimmed(nodes.listening, false);
  setDimmed(nodes.approach, false);

  densityToggle.textContent = `HUD: ${focus.density === 'expanded' ? 'Expanded' : 'Focused'}`;
  densityToggle.setAttribute('aria-pressed', focus.density === 'expanded' ? 'true' : 'false');
  densityToggle.setAttribute('aria-label', `HUD density ${focus.density}. Activate to switch density.`);
  controlHint.textContent = controlHintForSource(preference.inputSource);

  globalThis.__greyblueHudFocus = Object.freeze({
    ...focus.telemetry,
    inputSource: preference.inputSource,
  });
}

function persistDensity(nextDensity) {
  preference = deriveHudPreferenceState({
    settings: { hudDensity: nextDensity },
    inputSource: preference.inputSource,
  });
  saveSettingsPatch({ hudDensity: preference.density });
  lastKey = '';
  render(currentState);
}

function toggleDensity() {
  persistDensity(toggleHudDensity(preference.density));
}

function onKeydown(event) {
  if (!event.defaultPrevented && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyH') {
    event.preventDefault();
    toggleDensity();
    return;
  }
  queueMicrotask(() => render(currentState));
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

const refreshEvents = Object.freeze([
  'greyblue:expedition-context',
  'greyblue:expedition-arrival',
  'greyblue:expedition-culmination',
  'greyblue:route-completed',
  'greyblue:landmark-investigated',
  'greyblue:landmark-flight-encounter',
  'greyblue:crossing-cancelled',
  'greyblue:landing-approach-readback',
]);
for (const eventName of refreshEvents) globalThis.addEventListener?.(eventName, refreshSoon);
globalThis.addEventListener?.('keydown', onKeydown);
densityToggle.addEventListener('click', toggleDensity);
render(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  for (const eventName of refreshEvents) globalThis.removeEventListener?.(eventName, refreshSoon);
  globalThis.removeEventListener?.('keydown', onKeydown);
  densityToggle.removeEventListener('click', toggleDensity);
  preferenceRow.remove();
  style.remove();
  delete globalThis.__greyblueHudFocus;
}, { once: true });