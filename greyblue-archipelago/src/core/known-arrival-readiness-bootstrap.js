import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import { getPrivateKnownVoyageTarget } from './known-voyage-intention.js';
import { deriveKnownArrivalReadinessFrame } from './known-arrival-readiness-integration.js';
import { isStreamedIslandResident } from './streamed-island-pool.js';

let worldSeed = null;
let world = null;
let lastState = 'off';

function worldFor(seed) {
  const nextSeed = Number.isInteger(seed) ? seed : 1337;
  if (!world || worldSeed !== nextSeed) {
    worldSeed = nextSeed;
    world = buildArchipelago({ seed: nextSeed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function ensureStatusNode() {
  let node = document.querySelector('#greyblue-known-arrival-readiness');
  if (node?.isConnected) return node;
  const hud = document.querySelector('#hud');
  if (!hud) return null;
  node = document.createElement('div');
  node.id = 'greyblue-known-arrival-readiness';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  node.hidden = true;
  node.style.marginTop = '7px';
  node.style.fontSize = '11px';
  node.style.color = '#d9e4e6';
  hud.append(node);
  return node;
}

function renderStatus(publicState) {
  const node = ensureStatusNode();
  if (!node) return;
  const key = publicState?.active === true ? publicState.state : 'off';
  if (key === lastState) return;
  lastState = key;
  if (key === 'loading') {
    node.hidden = false;
    node.textContent = 'Known landfall is still resolving. Stay airborne while the island arrives.';
  } else if (key === 'degraded') {
    node.hidden = false;
    node.textContent = 'Known landfall surface is unavailable. Stay airborne or use recovery.';
  } else {
    node.hidden = true;
    node.textContent = '';
  }
}

function updateKnownArrivalReadiness() {
  const state = globalThis.__greyblueState;
  const voyage = globalThis.__greyblueKnownVoyageIntention;
  const target = getPrivateKnownVoyageTarget();
  const publicState = deriveKnownArrivalReadinessFrame({
    state,
    voyage,
    target,
    world: worldFor(state?.seed),
    crossing: globalThis.__greyblueHighAirCrossing?.active === true,
    isResident: isStreamedIslandResident,
  });
  globalThis.__greyblueKnownArrivalReadiness = publicState;
  renderStatus(publicState);
}

globalThis.__greyblueKnownArrivalReadiness = Object.freeze({ active: false, state: null });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithKnownArrivalReadiness(scene, camera) {
  updateKnownArrivalReadiness();
  return originalRender.call(this, scene, camera);
};
