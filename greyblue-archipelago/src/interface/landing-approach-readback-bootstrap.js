import { deriveLandingApproachReadback } from '../world/landing-approach-readback.js';

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

function inactive() {
  return Object.freeze({ active: false, alignment: null, descent: null });
}

function interrupted(state) {
  return state?.paused === true
    || state?.collision?.requiresRecovery === true
    || state?.flight?.mode === 'recovery'
    || state?.restorePublishing === true
    || state?.explorationRestorePublishing === true
    || globalThis.__greyblueCrossingObjective?.active === true;
}

function candidateCorridors(state) {
  const island = state?.nearestIsland;
  if (!island?.id || !Array.isArray(island.approachCorridors)) return [];
  if (!Array.isArray(state?.discovered) || !state.discovered.includes(island.id)) return [];
  if (!state?.currentRegion?.id || island.regionId !== state.currentRegion.id) return [];
  return island.approachCorridors;
}

export function deriveLiveLandingApproachReadback(state, crossingActive = false) {
  if (!state || crossingActive || interrupted(state)) return inactive();
  const position = state.position;
  const yaw = state.flight?.yaw;
  const verticalVelocity = state.flight?.velocity?.y;
  const airborne = state.flight?.airborne === true && state.collision?.grounded !== true;

  for (const corridor of candidateCorridors(state)) {
    const view = deriveLandingApproachReadback({
      eligible: true,
      airborne,
      interrupted: false,
      position,
      yaw,
      verticalVelocity,
      corridor,
    });
    if (view.active) return view;
  }
  return inactive();
}

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
  const view = deriveLiveLandingApproachReadback(
    state,
    globalThis.__greyblueCrossingObjective?.active === true,
  );
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

render(inactive());
if (currentState) apply(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  document.querySelector('#greyblue-landing-corridor-readback')?.remove();
  delete globalThis.__greyblueLandingApproachReadback;
}, { once: true });
