import { deriveLiveLandingApproachReadback } from './landing-approach-readback-live.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = '';

const COPY = Object.freeze({
  lined: 'Lane centered',
  left: 'Ease right',
  right: 'Ease left',
  shallow: 'Descent shallow',
  steady: 'Descent steady',
  steep: 'Descent steep',
});
const INACTIVE = Object.freeze({ active: false, alignment: null, descent: null });

function ensureNode() {
  let node = document.querySelector('#greyblue-landing-corridor-readback');
  if (node) return node;
  const hud = document.querySelector('#hud');
  if (!hud) return null;
  node = document.createElement('section');
  node.id = 'greyblue-landing-corridor-readback';
  node.hidden = true;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  Object.assign(node.style, {
    display: 'grid',
    gap: '2px',
    marginTop: '9px',
    paddingTop: '8px',
    borderTop: '1px solid #a7c0c84d',
  });
  hud.append(node);
  return node;
}

function render(view) {
  globalThis.__greyblueLandingApproachReadback = view;
  const node = ensureNode();
  if (!node) return;
  const key = `${view.active}|${view.alignment}|${view.descent}`;
  if (key === lastKey) return;
  lastKey = key;
  node.hidden = !view.active;
  if (!view.active) {
    node.replaceChildren();
    return;
  }

  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Final approach';
  eyebrow.style.cssText = 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c3d5d9';
  const line = document.createElement('strong');
  line.textContent = `${COPY[view.alignment]} · ${COPY[view.descent]}`;
  line.style.cssText = 'font-size:13px;font-weight:700';
  node.replaceChildren(eyebrow, line);
}

function apply(state) {
  const view = deriveLiveLandingApproachReadback(state, {
    crossingActive: globalThis.__greyblueCrossingObjective?.active === true,
  });
  render(view);
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:landing-approach-readback', { detail: view }));
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      if (!disposed) apply(currentState);
    },
  });
}

render(INACTIVE);
if (currentState) apply(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  document.querySelector('#greyblue-landing-corridor-readback')?.remove();
  delete globalThis.__greyblueLandingApproachReadback;
}, { once: true });
