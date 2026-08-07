import { createDestinationGuidanceHud } from './destination-guidance-hud.js';
import { createAtmosphereResponseModel } from './live-atmosphere-response-model.js';

const host = document.querySelector('#hud') ?? document.body;
const hud = createDestinationGuidanceHud({ documentRef: document, host });
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const atmosphere = createAtmosphereResponseModel();
let currentState = globalThis.__greyblueState ?? null;
let disposed = false;

const atmosphereStyle = document.createElement('style');
atmosphereStyle.dataset.greyblueAtmosphereResponse = 'true';
atmosphereStyle.textContent = `
  #greyblue-atmosphere-response{position:fixed;z-index:2;right:14px;top:14px;padding:6px 9px;border:1px solid #dce9ec55;border-radius:999px;background:#0b1118a8;color:#dce9ec;font-size:11px;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;backdrop-filter:blur(4px)}
  #greyblue-atmosphere-film{position:fixed;z-index:1;inset:0;pointer-events:none;opacity:calc(.05 + var(--greyblue-speed-pressure,0) * .15 + var(--greyblue-fog-pressure,0) * .12);box-shadow:inset 0 0 calc(72px + var(--greyblue-low-clearance,0) * 80px) rgba(4,12,18,calc(.08 + var(--greyblue-low-clearance,0) * .16));transition:opacity .24s ease,box-shadow .24s ease;background:linear-gradient(to bottom,rgba(221,242,247,calc(var(--greyblue-high-altitude,0) * .08)),transparent 34%,rgba(12,25,31,calc(var(--greyblue-low-clearance,0) * .09)))}
  html[data-greyblue-atmosphere="water-skim"] #greyblue-atmosphere-film{box-shadow:inset 0 -72px 100px rgba(87,151,169,.13)}
  html[data-greyblue-atmosphere="terrain-skim"] #greyblue-atmosphere-film{box-shadow:inset 0 -70px 100px rgba(64,90,74,.16)}
  html[data-greyblue-atmosphere="fog"] #greyblue-atmosphere-film{opacity:calc(.10 + var(--greyblue-fog-pressure,0) * .18)}
  @media (max-width:560px){#greyblue-atmosphere-response{right:8px;top:auto;bottom:8px;font-size:10px}}
  @media (prefers-reduced-motion:reduce){#greyblue-atmosphere-film{transition:none}}
`;
document.head.appendChild(atmosphereStyle);

const atmosphereFilm = document.createElement('div');
atmosphereFilm.id = 'greyblue-atmosphere-film';
atmosphereFilm.setAttribute('aria-hidden', 'true');
document.body.appendChild(atmosphereFilm);
const atmosphereBadge = document.createElement('div');
atmosphereBadge.id = 'greyblue-atmosphere-response';
atmosphereBadge.setAttribute('aria-hidden', 'true');
document.body.appendChild(atmosphereBadge);

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

function publishAtmosphere(state) {
  if (!state) return;
  const snapshot = atmosphere.update(state);
  if (!snapshot.changed) return;
  document.documentElement.dataset.greyblueAtmosphere = snapshot.mode;
  document.documentElement.style.setProperty('--greyblue-speed-pressure', snapshot.speedPressure.toFixed(3));
  document.documentElement.style.setProperty('--greyblue-fog-pressure', snapshot.fogPressure.toFixed(3));
  document.documentElement.style.setProperty('--greyblue-low-clearance', snapshot.lowClearance.toFixed(3));
  document.documentElement.style.setProperty('--greyblue-high-altitude', snapshot.highAltitude.toFixed(3));
  atmosphereBadge.dataset.mode = snapshot.mode;
  atmosphereBadge.textContent = `${snapshot.regionName} · ${snapshot.mode.replaceAll('-', ' ')}`;
}

function publish(state) {
  if (disposed) return;
  publishAtmosphere(state);
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
  atmosphereFilm.remove();
  atmosphereBadge.remove();
  atmosphereStyle.remove();
}, { once: true });

publish(currentState);
