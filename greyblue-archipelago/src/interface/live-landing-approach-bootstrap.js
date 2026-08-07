import { deriveLandingApproach } from './live-landing-approach-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = '';
let lastAnnouncementPhase = '';

const panel = document.createElement('section');
panel.id = 'greyblue-landing-approach';
panel.hidden = true;
panel.setAttribute('role', 'status');
panel.setAttribute('aria-live', 'off');
panel.innerHTML = `
  <div data-greyblue-landing-eyebrow>Landing approach</div>
  <div data-greyblue-landing-title></div>
  <div data-greyblue-landing-status></div>
  <div data-greyblue-landing-advice></div>
  <div data-greyblue-landing-live data-visually-hidden aria-live="polite" aria-atomic="true"></div>
`;
host.append(panel);

const titleNode = panel.querySelector('[data-greyblue-landing-title]');
const statusNode = panel.querySelector('[data-greyblue-landing-status]');
const adviceNode = panel.querySelector('[data-greyblue-landing-advice]');
const liveNode = panel.querySelector('[data-greyblue-landing-live]');

function render(state) {
  if (disposed) return;
  const view = deriveLandingApproach(state);
  const key = `${view.visible}|${view.islandName}|${view.phase}|${view.distance}|${view.bearing.direction}|${view.bearing.degrees}|${view.clearance}|${view.speed}|${view.advice}`;
  if (key === lastKey) return;
  lastKey = key;

  panel.hidden = !view.visible;
  panel.dataset.phase = view.phase;
  titleNode.textContent = view.islandName;
  statusNode.textContent = view.visible
    ? `${view.phase.toUpperCase()} · ${view.distance} away · ${view.bearing.direction}${view.bearing.degrees ? ` ${view.bearing.degrees}°` : ''} · ${view.clearance} clearance`
    : '';
  adviceNode.textContent = view.advice;
  panel.setAttribute('aria-label', view.compactLabel);

  if (view.visible && (view.phase === 'final' || view.phase === 'flare' || view.phase === 'landed') && view.phase !== lastAnnouncementPhase) {
    liveNode.textContent = `${view.phase}. ${view.advice}`;
    lastAnnouncementPhase = view.phase;
  } else if (!view.visible) {
    lastAnnouncementPhase = '';
    liveNode.textContent = '';
  }
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
  panel.remove();
}, { once: true });
