import { buildArchipelago } from '../world/archipelago.js';
import { createLandmarkEncounterState, selectLandmarkEncounter, activateLandmarkEncounter } from './landmark-encounter-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let encounterState = createLandmarkEncounterState();
let encounterView = null;
let world = null;
let worldSeed = null;
let disposed = false;
let revealTimer = 0;

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

function render(state) {
  if (disposed || !state?.ready) {
    panel.hidden = true;
    encounterView = null;
    return;
  }

  const selection = selectLandmarkEncounter({
    world: getWorld(state),
    position: state.position,
    altitude: state.position?.y,
  }, encounterState);
  encounterState = selection.state;
  encounterView = selection.view;
  panel.hidden = !encounterView.visible;
  if (!encounterView.visible) return;

  titleNode.textContent = encounterView.title;
  statusNode.textContent = encounterView.status;
  promptNode.textContent = encounterView.prompt;
  panel.dataset.encounterClass = encounterView.encounterClass || 'threshold';
  panel.dataset.available = encounterView.available ? 'true' : 'false';
}

function revealEncounter() {
  const result = activateLandmarkEncounter(encounterState, encounterView);
  if (!result.changed || !result.reveal) return;
  encounterState = result.state;
  revealNode.hidden = false;
  revealNode.textContent = result.reveal.text;
  announcement.textContent = `${result.reveal.title}. ${result.reveal.text}`;
  promptNode.textContent = 'Encounter remembered';
  panel.dataset.available = 'false';
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    if (!disposed) revealNode.hidden = true;
  }, 9000);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyF') revealEncounter();
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
  if (revealTimer) clearTimeout(revealTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  announcement.remove();
}, { once: true });
