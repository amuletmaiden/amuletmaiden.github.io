import { createDestinationGuidanceHud } from './destination-guidance-hud.js';

const host = document.querySelector('#hud') ?? document.body;
const hud = createDestinationGuidanceHud({ documentRef: document, host });
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
let currentState = globalThis.__greyblueState ?? null;
let disposed = false;

function toDegrees(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) <= Math.PI * 2 + 0.001 ? value * 180 / Math.PI : value;
}

function distanceBand(distance) {
  if (!Number.isFinite(distance)) return 'far';
  if (distance <= 120) return 'arrival';
  if (distance <= 600) return 'near';
  if (distance <= 1800) return 'mid';
  return 'far';
}

function phaseFor(distance) {
  if (!Number.isFinite(distance)) return 'en-route';
  if (distance <= 120) return 'arrived';
  if (distance <= 700) return 'approach';
  return 'en-route';
}

function guidanceInput(state) {
  const route = state?.routeGuidance;
  const destinationId = route?.destinationId ?? route?.destinationIslandId ?? null;
  if (!destinationId) return null;

  const phase = phaseFor(route.remainingDistance);
  const announcement = phase === 'approach' || phase === 'arrived'
    ? { id: `${destinationId}:${phase}`, kind: phase === 'arrived' ? 'arrived' : 'approach' }
    : null;

  return {
    guidance: {
      destination: {
        id: destinationId,
        name: route.destinationName ?? destinationId,
        bearingDegrees: ((toDegrees(route.bearing) % 360) + 360) % 360,
        distanceBand: distanceBand(route.remainingDistance),
        phase,
        motion: phase === 'arrived' ? 'none' : 'subtle',
        soundHookId: null,
      },
      announcement,
    },
    headingDegrees: ((toDegrees(state?.flight?.yaw) % 360) + 360) % 360,
    viewportWidth: globalThis.innerWidth,
    mountState: {
      viewportWidth: globalThis.innerWidth,
      settings: {
        mode: 'standard',
        reducedMotion,
        soundEnabled: false,
      },
    },
  };
}

function publish(state) {
  if (disposed) return;
  const input = guidanceInput(state);
  if (!input) {
    hud.clear();
    return;
  }
  hud.update(input);
}

const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
if (!descriptor || descriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      return currentState;
    },
    set(value) {
      currentState = value;
      publish(value);
    },
  });
} else {
  publish(currentState);
}

function onResize() {
  publish(currentState);
}

globalThis.addEventListener?.('resize', onResize);
globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('resize', onResize);
  hud.dispose();
}, { once: true });

publish(currentState);
