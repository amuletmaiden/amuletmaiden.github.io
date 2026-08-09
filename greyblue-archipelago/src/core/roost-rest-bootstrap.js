import { deriveRoostRest, roostRestPublicState } from './roost-rest.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let resting = false;
let lastPublicKey = '';
let lastResting = false;

const host = document.querySelector('#hud') ?? document.body;
const panel = document.createElement('section');
panel.id = 'greyblue-roost-rest';
panel.hidden = true;
panel.setAttribute('role', 'status');
panel.setAttribute('aria-live', 'polite');
panel.setAttribute('aria-atomic', 'true');
panel.innerHTML = '<span data-greyblue-roost-rest-line></span> <button type="button" data-greyblue-roost-rest-action>Rest here</button>';
const lineNode = panel.querySelector('[data-greyblue-roost-rest-line]');
const actionNode = panel.querySelector('[data-greyblue-roost-rest-action]');
host.append(panel);

function reducedMotionPreferred() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function groundedZone(state) {
  const zone = state?.nearestIsland?.landingZone;
  return typeof zone?.id === 'string' ? zone.id : null;
}

function departureLine(departureClass) {
  const table = Object.freeze({
    landmark: 'The known mystery still waits beyond the roost.',
    frontier: 'There is still an unfamiliar known crossing to take.',
    roost: 'Another remembered roost gives the journey a direction.',
    familiar: 'The remembered crossings remain open when you leave.',
  });
  return table[departureClass] ?? null;
}

function derive(state = currentState, enterRest = false) {
  const speed = Number(state?.flight?.speed);
  const next = deriveRoostRest({
    earnedRoost: state?.earnedRoost ?? globalThis.__greyblueRoostRecovery ?? null,
    grounded: state?.collision?.grounded === true && state?.flight?.airborne !== true,
    groundedIslandId: state?.nearestIsland?.id ?? null,
    groundedZoneId: groundedZone(state),
    recoveryActive: state?.collision?.requiresRecovery === true,
    movementActive: Number.isFinite(speed) && speed > 1.5,
    crossingActive: state?.expedition?.phase === 'crossing' || state?.routeChoice?.reason === 'active-crossing',
    resting,
    enterRest,
    expedition: state?.expedition ?? globalThis.__greyblueExpedition ?? null,
    reducedMotion: reducedMotionPreferred(),
  });
  resting = next.resting;
  return next;
}

function render(next) {
  const publicState = roostRestPublicState(next);
  const departure = departureLine(publicState.departureClass);
  if (publicState.resting) {
    lineNode.textContent = departure ? `Resting at the earned roost. ${departure}` : 'Resting at the earned roost.';
    actionNode.textContent = 'Leave rest';
    actionNode.hidden = false;
    panel.hidden = false;
  } else if (publicState.available) {
    lineNode.textContent = 'This earned roost is quiet enough to rest.';
    actionNode.textContent = 'Rest here';
    actionNode.hidden = false;
    panel.hidden = false;
  } else {
    lineNode.textContent = '';
    actionNode.hidden = true;
    panel.hidden = true;
  }
  panel.dataset.state = publicState.resting ? 'resting' : publicState.available ? 'available' : 'unavailable';
  return { publicState, departure };
}

function publish(next) {
  const { publicState, departure } = render(next);
  globalThis.__greyblueRoostRest = publicState;
  const key = JSON.stringify(publicState);
  if (key === lastPublicKey) return;
  lastPublicKey = key;
  const beganRest = publicState.resting && !lastResting;
  const endedRest = !publicState.resting && lastResting;
  lastResting = publicState.resting;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:roost-rest', {
    detail: Object.freeze({
      ...publicState,
      line: publicState.resting
        ? (departure ? `Resting at the earned roost. ${departure}` : 'Resting at the earned roost.')
        : null,
      beganRest,
      endedRest,
    }),
  }));
}

function recompute(state = currentState, enterRest = false) {
  if (disposed || !state || typeof state !== 'object') {
    resting = false;
    publish(deriveRoostRest());
    return;
  }
  publish(derive(state, enterRest));
}

function onAction() {
  if (disposed) return;
  if (resting) {
    resting = false;
    recompute(currentState);
    return;
  }
  recompute(currentState, true);
}

actionNode.addEventListener('click', onAction);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      const state = priorGet ? priorGet() : currentState;
      if (!state || typeof state !== 'object') return state;
      return { ...state, roostRest: globalThis.__greyblueRoostRest ?? roostRestPublicState() };
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      recompute(currentState);
    },
  });
}

recompute(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  actionNode.removeEventListener('click', onAction);
  panel.remove();
  delete globalThis.__greyblueRoostRest;
}, { once: true });
