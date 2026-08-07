import { createExplorationJournalState, stepExplorationJournal } from './exploration-journal-model.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let journalState = createExplorationJournalState();
let disposed = false;
let open = false;

const panel = document.createElement('section');
panel.id = 'greyblue-exploration-journal';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Exploration journal');
panel.innerHTML = `
  <div class="greyblue-journal-heading">Exploration journal</div>
  <div data-greyblue-journal-objective></div>
  <div data-greyblue-journal-context></div>
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
const discoveriesNode = panel.querySelector('[data-greyblue-journal-discoveries]');

function render(state) {
  if (disposed) return;
  const next = stepExplorationJournal(journalState, state);
  journalState = next.state;
  objectiveNode.textContent = next.view.objective;
  contextNode.textContent = next.view.context;
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

globalThis.addEventListener?.('keydown', onKeyDown);

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
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  announcement.remove();
}, { once: true });
