import { buildArchipelago } from '../world/archipelago.js';
import { loadGame } from './save.js';
import { collectInvestigatedLandmarkIds } from './landmark-manifestation.js';
import { selectAwakenedLandmarkEcho, shouldPreferAwakenedEcho } from './landmark-listening-echo.js';
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
const investigatedLandmarkIds = collectInvestigatedLandmarkIds(loadGame()?.exploration);

const panel = document.createElement('section');
panel.id = 'greyblue-listening-pulse';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Listening pulse');
panel.innerHTML = `<div data-greyblue-listening-eyebrow>Listening</div><strong data-greyblue-listening-title></strong><div data-greyblue-listening-status></div><div data-greyblue-listening-omen hidden></div>`;
const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);
const titleNode = panel.querySelector('[data-greyblue-listening-title]');
const statusNode = panel.querySelector('[data-greyblue-listening-status]');
const omenNode = panel.querySelector('[data-greyblue-listening-omen]');

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || seed !== worldSeed) { worldSeed = seed; world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 }); }
  return world;
}

function activeOmen() {
  const omen = globalThis.__greyblueRegionalOmen;
  return omen?.active && omen.regionId === currentState?.currentRegion?.id ? omen : null;
}

function applyOmen() {
  const omen = activeOmen();
  omenNode.hidden = !omen;
  omenNode.textContent = omen?.tone?.text ?? '';
  if (omen) globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', { detail: { regionId: omen.regionId, toneId: omen.tone?.id, soundHook: omen.tone?.soundHook } }));
  return omen;
}

function clearLater() {
  if (clearTimer) clearTimeout(clearTimer);
  const delay = Math.max(0, visibleUntil - performance.now());
  clearTimer = setTimeout(() => { clearTimer = 0; if (performance.now() >= visibleUntil) panel.hidden = true; }, delay + 20);
}

function showAwakenedEcho(echo) {
  panel.hidden = false;
  panel.dataset.found = 'true'; panel.dataset.kind = 'awakened-landmark'; panel.dataset.turn = echo.turn;
  titleNode.textContent = 'A remembered resonance answers.';
  statusNode.textContent = `${echo.distanceBand} · ${echo.turn}`;
  const omen = applyOmen();
  announcement.textContent = `${titleNode.textContent} ${echo.distanceBand}, ${echo.turn}.${omen ? ` ${omen.tone.text}` : ''}`;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:listening-echo', { detail: { kind: 'awakened-landmark', islandId: echo.islandId, landmarkId: echo.landmarkId, regionId: echo.regionId, distanceBand: echo.distanceBand, turn: echo.turn, soundHook: echo.soundHook } }));
}

function listen() {
  const now = performance.now();
  if (!currentState?.ready || currentState.paused || now < cooldownUntil) return;
  cooldownUntil = now + 3500; visibleUntil = now + 8500;
  const currentWorld = getWorld(currentState);
  const result = selectListeningSignal({ world: currentWorld, position: currentState.position, yaw: currentState.flight?.yaw, discovered: currentState.discovered });
  const echo = selectAwakenedLandmarkEcho({ world: currentWorld, position: currentState.position, yaw: currentState.flight?.yaw, discoveredIslandIds: currentState.discovered, investigatedLandmarkIds });
  if (shouldPreferAwakenedEcho(echo, result)) { showAwakenedEcho(echo); clearLater(); return; }

  panel.hidden = false; panel.dataset.kind = 'unknown-island'; panel.dataset.found = String(result.found);
  if (!result.found) {
    delete panel.dataset.turn;
    titleNode.textContent = 'Only open mist answers.';
    statusNode.textContent = `No unknown isle within ${Math.round(result.range)}.`;
    const omen = applyOmen();
    announcement.textContent = `${titleNode.textContent}${omen ? ` ${omen.tone.text}` : ''}`;
    clearLater(); return;
  }
  const distance = Math.max(0, Math.round(result.distance));
  titleNode.textContent = result.landmarkSignal ? 'A stronger echo answers.' : 'An echo answers.';
  statusNode.textContent = `${result.intensity} · ${distance} away · ${result.turn}`;
  panel.dataset.intensity = result.intensity; panel.dataset.turn = result.turn;
  const omen = applyOmen();
  announcement.textContent = `${titleNode.textContent} ${distance} away, ${result.turn}.${omen ? ` ${omen.tone.text}` : ''}`;
  clearLater();
}

function onKeyDown(event) { if (!event.defaultPrevented && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyQ') listen(); }
function onLandmarkInvestigated(event) { const landmarkId = typeof event?.detail?.landmarkId === 'string' ? event.detail.landmarkId.trim().slice(0, 120) : ''; if (landmarkId) investigatedLandmarkIds.add(landmarkId); }
globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated);
if (!priorDescriptor || priorDescriptor.configurable) Object.defineProperty(globalThis, '__greyblueState', { configurable: true, enumerable: true, get() { return priorGet ? priorGet() : currentState; }, set(value) { if (priorSet) priorSet(value); currentState = priorGet ? priorGet() : value; } });
globalThis.addEventListener?.('beforeunload', () => { disposed = true; if (clearTimer) clearTimeout(clearTimer); globalThis.removeEventListener?.('keydown', onKeyDown); globalThis.removeEventListener?.('greyblue:landmark-investigated', onLandmarkInvestigated); if (disposed) { panel.remove(); announcement.remove(); } }, { once: true });