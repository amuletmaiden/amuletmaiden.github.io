import * as THREE from 'three';
import { knownCrossingDestinationMistMultiplier } from './known-crossing-destination-atmosphere.js';

let current = Object.freeze({ active: false, atmosphereClass: null, stage: null });
let disposed = false;

const hud = document.querySelector('#hud');
const panel = document.createElement('section');
panel.id = 'greyblue-destination-atmosphere';
panel.hidden = true;
panel.setAttribute('aria-live', 'polite');
panel.setAttribute('aria-atomic', 'true');
const line = document.createElement('p');
panel.append(line);
hud?.append(panel);

const stageText = Object.freeze({
  hint: 'The destination weather begins to touch the crossing.',
  gathering: 'The destination weather is gathering around the dragon.',
  near: 'The destination weather now fills the air ahead.',
});

function publish(detail) {
  const active = detail?.active === true;
  current = Object.freeze({
    active,
    atmosphereClass: active && typeof detail?.atmosphereClass === 'string' ? detail.atmosphereClass : null,
    stage: active && typeof detail?.stage === 'string' ? detail.stage : null,
  });

  panel.hidden = !current.active;
  line.textContent = current.active ? stageText[current.stage] ?? 'The destination weather gathers ahead.' : '';

  if (current.active) {
    panel.dataset.atmosphere = current.atmosphereClass;
    panel.dataset.stage = current.stage;
  } else {
    delete panel.dataset.atmosphere;
    delete panel.dataset.stage;
  }

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:destination-atmosphere-presented', {
    detail: Object.freeze({ ...current }),
  }));
}

function onAtmosphere(event) {
  if (disposed) return;
  publish(event?.detail);
}

globalThis.addEventListener?.('greyblue:known-crossing-destination-atmosphere', onAtmosphere);

const existing = globalThis.__greyblueKnownCrossingDestinationAtmosphere;
if (existing?.active) publish(existing);

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithDestinationAtmosphere(scene, camera) {
  const fog = scene?.fog;
  if (!fog?.isFogExp2 || !Number.isFinite(fog.density) || !current.active) {
    return originalRender.call(this, scene, camera);
  }

  const authoredDensity = fog.density;
  fog.density = authoredDensity * knownCrossingDestinationMistMultiplier(current);
  try {
    return originalRender.call(this, scene, camera);
  } finally {
    fog.density = authoredDensity;
  }
};

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  globalThis.removeEventListener?.('greyblue:known-crossing-destination-atmosphere', onAtmosphere);
  if (THREE.WebGLRenderer.prototype.render !== originalRender) {
    THREE.WebGLRenderer.prototype.render = originalRender;
  }
  panel.remove();
}, { once: true });
