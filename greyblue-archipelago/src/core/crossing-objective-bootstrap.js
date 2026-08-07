import { buildArchipelago } from '../world/archipelago.js';
import { createCrossingObjectiveModel } from './crossing-objective-model.js';

const host = document.querySelector('#hud') ?? document.body;
const model = createCrossingObjectiveModel();
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let disposed = false;
let clearTimer = 0;
let lastAnnouncement = '';

const panel = document.createElement('section');
panel.id = 'greyblue-crossing-objective';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Crossing objective');
panel.innerHTML = `
  <div data-greyblue-crossing-eyebrow>Crossing</div>
  <strong data-greyblue-crossing-title></strong>
  <div data-greyblue-crossing-status></div>
  <div class="greyblue-crossing-track" aria-hidden="true"><i data-greyblue-crossing-progress></i></div>
  <div data-greyblue-crossing-advice></div>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const titleNode = panel.querySelector('[data-greyblue-crossing-title]');
const statusNode = panel.querySelector('[data-greyblue-crossing-status]');
const progressNode = panel.querySelector('[data-greyblue-crossing-progress]');
const adviceNode = panel.querySelector('[data-greyblue-crossing-advice]');

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || worldSeed !== seed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function announce(text) {
  const bounded = String(text ?? '').slice(0, 180);
  if (!bounded || bounded === lastAnnouncement) return;
  lastAnnouncement = bounded;
  announcement.textContent = bounded;
}

function render(state) {
  if (disposed || !state?.ready) {
    panel.hidden = true;
    return;
  }

  const view = model.update({
    guidance: state.routeGuidance,
    position: state.position,
    yaw: state.flight?.yaw,
    world: getWorld(state),
  });
  panel.hidden = !view.visible;
  if (!view.visible) return;

  titleNode.textContent = view.destinationName;
  const distance = Math.max(0, Math.round(view.remainingDistance));
  const percent = Math.round(view.progress * 100);
  statusNode.textContent = view.arrived
    ? 'Arrived'
    : `${distance} away · ${view.turn} · ${percent}%`;
  progressNode.style.transform = `scaleX(${view.progress.toFixed(4)})`;
  panel.dataset.phase = view.phase;
  panel.dataset.fogRisk = view.fogRisk;

  const advice = [];
  if (view.altitudeAdvice) advice.push(view.altitudeAdvice);
  if (!view.arrived && view.fogRisk === 'high') advice.push('high fog');
  adviceNode.textContent = advice.join(' · ');

  if (view.phase === 'crossing' && percent >= 10 && percent <= 12) {
    announce(`Crossing committed. ${view.destinationName}.`);
  } else if (view.phase === 'approach') {
    announce(`Approaching ${view.destinationName}.`);
  } else if (view.arrived) {
    announce(`Crossing complete. ${view.destinationName}.`);
    if (!clearTimer) {
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        if (model.clearArrival()) panel.hidden = true;
      }, 5000);
    }
  }
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code !== 'KeyX') return;
  if (model.cancel()) {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = 0;
    panel.hidden = true;
    announce('Crossing objective cleared.');
  }
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
  if (clearTimer) clearTimeout(clearTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  announcement.remove();
}, { once: true });
