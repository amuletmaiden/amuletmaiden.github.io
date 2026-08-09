import { createExplorationJournalState, stepExplorationJournal } from './exploration-journal-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let journalState = createExplorationJournalState();
let disposed = false;
let open = false;
let omen = globalThis.__greyblueRegionalOmen ?? null;
let expeditionLine = null;
let culminationLine = null;
let roostRestLine = null;
let familiarCrossingLine = null;
let familiarLandmarkEchoLine = null;
let familiarLandmarkEchoTimer = 0;

const panel = document.createElement('section');
panel.id = 'greyblue-exploration-journal';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Exploration journal');
panel.innerHTML = `
  <div class="greyblue-journal-heading">Exploration journal</div>
  <div data-greyblue-journal-objective></div>
  <div data-greyblue-journal-context></div>
  <div data-greyblue-journal-expedition hidden></div>
  <div data-greyblue-journal-culmination hidden></div>
  <div data-greyblue-journal-roost-rest hidden></div>
  <div data-greyblue-journal-familiar-crossing hidden></div>
  <div data-greyblue-journal-familiar-landmark-echo hidden></div>
  <div data-greyblue-journal-omen hidden></div>
  <ol data-greyblue-journal-discoveries></ol>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const objectiveNode = panel.querySelector('[data-greyblue-journal-objective]');
const contextNode = panel.querySelector('[data-greyblue-journal-context]');
const expeditionNode = panel.querySelector('[data-greyblue-journal-expedition]');
const culminationNode = panel.querySelector('[data-greyblue-journal-culmination]');
const roostRestNode = panel.querySelector('[data-greyblue-journal-roost-rest]');
const familiarCrossingNode = panel.querySelector('[data-greyblue-journal-familiar-crossing]');
const familiarLandmarkEchoNode = panel.querySelector('[data-greyblue-journal-familiar-landmark-echo]');
const omenNode = panel.querySelector('[data-greyblue-journal-omen]');
const discoveriesNode = panel.querySelector('[data-greyblue-journal-discoveries]');

function render(state) {
  if (disposed) return;
  const next = stepExplorationJournal(journalState, state);
  journalState = next.state;
  objectiveNode.textContent = next.view.objective;
  contextNode.textContent = next.view.context;
  expeditionNode.hidden = !expeditionLine;
  expeditionNode.textContent = expeditionLine ?? '';
  culminationNode.hidden = !culminationLine;
  culminationNode.textContent = culminationLine ?? '';
  roostRestNode.hidden = !roostRestLine;
  roostRestNode.textContent = roostRestLine ?? '';
  familiarCrossingNode.hidden = !familiarCrossingLine;
  familiarCrossingNode.textContent = familiarCrossingLine ?? '';
  familiarLandmarkEchoNode.hidden = !familiarLandmarkEchoLine;
  familiarLandmarkEchoNode.textContent = familiarLandmarkEchoLine ?? '';
  const activeOmen = omen?.active && omen.regionId && omen.regionId === state?.currentRegion?.id ? omen : null;
  omenNode.hidden = !activeOmen;
  omenNode.textContent = activeOmen?.tone?.text ?? '';
  discoveriesNode.replaceChildren(...next.view.discoveries.map((label) => {
    const item = document.createElement('li');
    item.textContent = label;
    return item;
  }));
  if (next.view.announcement) announcement.textContent = next.view.announcement;
  panel.hidden = !open;
  panel.dataset.journalState = open ? 'open' : 'closed';
}

function setOpen(nextOpen) {
  open = Boolean(nextOpen);
  render(currentState);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyJ' && !event.repeat) {
    setOpen(!open);
    return;
  }
  if (event.code === 'Escape' && open) setOpen(false);
}

function onRegionalOmen(event) {
  omen = event?.detail ?? null;
  render(currentState);
}

function onExpeditionContext(event) {
  const line = typeof event?.detail?.line === 'string' ? event.detail.line.trim().slice(0, 220) : '';
  expeditionLine = line || null;
  render(currentState);
}

function onExpeditionCulmination(event) {
  const active = Boolean(event?.detail?.active);
  const line = active && typeof event?.detail?.line === 'string' ? event.detail.line.trim().slice(0, 220) : '';
  culminationLine = line || null;
  render(currentState);
}

function onRoostRest(event) {
  const active = Boolean(event?.detail?.resting);
  const line = active && typeof event?.detail?.line === 'string' ? event.detail.line.trim().slice(0, 220) : '';
  roostRestLine = line || null;
  render(currentState);
}

function onFamiliarCrossingSignature(event) {
  const active = Boolean(event?.detail?.active);
  const line = active && typeof event?.detail?.line === 'string' ? event.detail.line.trim().slice(0, 220) : '';
  familiarCrossingLine = line || null;
  if (!active) familiarLandmarkEchoLine = null;
  render(currentState);
}

function onFamiliarLandmarkEcho(event) {
  if (familiarLandmarkEchoTimer) clearTimeout(familiarLandmarkEchoTimer);
  const active = event?.detail?.active === true;
  const line = active && typeof event?.detail?.line === 'string' ? event.detail.line.trim().slice(0, 220) : '';
  familiarLandmarkEchoLine = line || null;
  render(currentState);
  if (!familiarLandmarkEchoLine) return;
  familiarLandmarkEchoTimer = setTimeout(() => {
    familiarLandmarkEchoTimer = 0;
    familiarLandmarkEchoLine = null;
    render(currentState);
  }, 8500);
}

globalThis.addEventListener?.('keydown', onKeyDown);
globalThis.addEventListener?.('greyblue:regional-omen', onRegionalOmen);
globalThis.addEventListener?.('greyblue:expedition-context', onExpeditionContext);
globalThis.addEventListener?.('greyblue:expedition-culmination', onExpeditionCulmination);
globalThis.addEventListener?.('greyblue:roost-rest', onRoostRest);
globalThis.addEventListener?.('greyblue:familiar-crossing-signature', onFamiliarCrossingSignature);
globalThis.addEventListener?.('greyblue:familiar-crossing-landmark-echo', onFamiliarLandmarkEcho);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
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
  if (familiarLandmarkEchoTimer) clearTimeout(familiarLandmarkEchoTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  globalThis.removeEventListener?.('greyblue:regional-omen', onRegionalOmen);
  globalThis.removeEventListener?.('greyblue:expedition-context', onExpeditionContext);
  globalThis.removeEventListener?.('greyblue:expedition-culmination', onExpeditionCulmination);
  globalThis.removeEventListener?.('greyblue:roost-rest', onRoostRest);
  globalThis.removeEventListener?.('greyblue:familiar-crossing-signature', onFamiliarCrossingSignature);
  globalThis.removeEventListener?.('greyblue:familiar-crossing-landmark-echo', onFamiliarLandmarkEcho);
  panel.remove();
  announcement.remove();
}, { once: true });
