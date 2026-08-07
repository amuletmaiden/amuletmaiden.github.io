import { buildArchipelago } from '../world/archipelago.js';
import { selectListeningSignal } from './listening-pulse-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let world = null;
let worldSeed = null;
let visibleUntil = 0;
let cooldownUntil = 0;
let clearTimer = 0;
let disposed = false;

const panel = document.createElement('section');
panel.id = 'greyblue-listening-pulse';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Listening pulse');
panel.innerHTML = `
  <div data-greyblue-listening-eyebrow>Listening</div>
  <strong data-greyblue-listening-title></strong>
  <div data-greyblue-listening-status></div>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const titleNode = panel.querySelector('[data-greyblue-listening-title]');
const statusNode = panel.querySelector('[data-greyblue-listening-status]');

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || seed !== worldSeed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function clearLater() {
  if (clearTimer) clearTimeout(clearTimer);
  const delay = Math.max(0, visibleUntil - performance.now());
  clearTimer = setTimeout(() => {
    clearTimer = 0;
    if (performance.now() >= visibleUntil) panel.hidden = true;
  }, delay + 20);
}

function listen() {
  const now = performance.now();
  if (!currentState?.ready || currentState.paused || now < cooldownUntil) return;
  cooldownUntil = now + 3500;
  visibleUntil = now + 8500;

  const result = selectListeningSignal({
    world: getWorld(currentState),
    position: currentState.position,
    yaw: currentState.flight?.yaw,
    discovered: currentState.discovered,
  });

  panel.hidden = false;
  panel.dataset.found = String(result.found);
  if (!result.found) {
    titleNode.textContent = 'Only open mist answers.';
    statusNode.textContent = `No unknown isle within ${Math.round(result.range)}.`;
    announcement.textContent = titleNode.textContent;
    clearLater();
    return;
  }

  const distance = Math.max(0, Math.round(result.distance));
  titleNode.textContent = result.landmarkSignal ? 'A stronger echo answers.' : 'An echo answers.';
  statusNode.textContent = `${result.intensity} · ${distance} away · ${result.turn}`;
  panel.dataset.intensity = result.intensity;
  panel.dataset.turn = result.turn;
  announcement.textContent = `${titleNode.textContent} ${distance} away, ${result.turn}.`;
  clearLater();
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyQ') listen();
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
    },
  });
}

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (clearTimer) clearTimeout(clearTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  if (!disposed) return;
  panel.remove();
  announcement.remove();
}, { once: true });
