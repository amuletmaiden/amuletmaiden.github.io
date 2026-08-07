import { deriveFlightInstruments } from './live-flight-instruments-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;

const strip = document.createElement('section');
strip.id = 'greyblue-flight-instruments';
strip.setAttribute('role', 'status');
strip.setAttribute('aria-label', 'Flight instruments');
strip.setAttribute('aria-live', 'off');
strip.innerHTML = `
  <div data-greyblue-instrument-mode></div>
  <div class="greyblue-instrument-grid">
    <span><b data-greyblue-instrument-speed>0</b><small>speed</small></span>
    <span><b data-greyblue-instrument-altitude>0</b><small>altitude</small></span>
    <span><b data-greyblue-instrument-clearance>0</b><small>clearance</small></span>
  </div>
  <div data-greyblue-instrument-caution hidden></div>
`;
host.append(strip);

const modeNode = strip.querySelector('[data-greyblue-instrument-mode]');
const speedNode = strip.querySelector('[data-greyblue-instrument-speed]');
const altitudeNode = strip.querySelector('[data-greyblue-instrument-altitude]');
const clearanceNode = strip.querySelector('[data-greyblue-instrument-clearance]');
const cautionNode = strip.querySelector('[data-greyblue-instrument-caution]');
let lastKey = '';

function render(state) {
  if (disposed) return;
  const view = deriveFlightInstruments(state);
  const key = `${view.mode}|${view.speed}|${view.altitude}|${view.clearance}|${view.trend}|${view.caution}`;
  if (key === lastKey) return;
  lastKey = key;
  modeNode.textContent = `${view.mode} · ${view.trend}`;
  speedNode.textContent = view.speed;
  altitudeNode.textContent = view.altitude;
  clearanceNode.textContent = view.clearance;
  cautionNode.textContent = view.caution;
  cautionNode.hidden = !view.caution;
  strip.dataset.caution = view.caution || 'none';
  strip.setAttribute('aria-label', `Flight instruments. ${view.compactLabel}. ${view.trend}.`);
}

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
  strip.remove();
}, { once: true });
