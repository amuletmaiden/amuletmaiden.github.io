import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceInterfaceCoordinator } from '../src/interface/guidance-interface-coordinator.js';

function node() {
  const listeners = new Map();
  return {
    attributes: {},
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    textContent: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    setAttribute(name, value) { this.attributes[name] = value; },
    emit(type, event = {}) { listeners.get(type)?.(event); },
  };
}

function fixture() {
  const ids = [
    'greyblue-guidance-help-trigger',
    'greyblue-guidance-help',
    'greyblue-guidance-help-status',
    'greyblue-guidance-settings',
    'greyblue-guidance-level',
    'greyblue-reduced-motion',
    'greyblue-sound-cues',
    'greyblue-guidance-close',
    'greyblue-guidance-status',
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, node()]));
  const documentLike = node();
  documentLike.getElementById = id => nodes[id] ?? null;
  return { documentLike, nodes };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
  };
}

test('renders settings and help surfaces through one coordinator', () => {
  const { documentLike, nodes } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage() });
  const result = coordinator.render();
  assert.equal(result.disposed, false);
  assert.equal(nodes['greyblue-guidance-help-trigger'].attributes['aria-keyshortcuts'], 'G');
  assert.equal(nodes['greyblue-guidance-help'].hidden, true);
  assert.equal(result.telemetry.renders, 1);
});

test('routes explicit help actions and updates the controlled region', () => {
  const { documentLike, nodes } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage() });
  coordinator.render();
  const result = coordinator.dispatchHelp({ type: 'open-help' });
  assert.equal(result.help.open, true);
  assert.equal(nodes['greyblue-guidance-help'].hidden, false);
  assert.equal(nodes['greyblue-guidance-help-trigger'].attributes['aria-expanded'], 'true');
});

test('keyboard binding remains connected to the help model', () => {
  const { documentLike, nodes } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage() });
  coordinator.render();
  let prevented = 0;
  documentLike.emit('keydown', { key: 'g', preventDefault() { prevented += 1; } });
  assert.equal(prevented, 1);
  assert.equal(nodes['greyblue-guidance-help'].hidden, false);
});

test('settings actions remain isolated from help state', () => {
  const { documentLike } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage() });
  const before = coordinator.snapshot().help.open;
  const result = coordinator.dispatchSettings({ type: 'set-guidance-level', value: 'minimal' });
  assert.equal(result.routed, true);
  assert.equal(result.help.open, before);
});

test('shared announcements are bounded and deduplicated', () => {
  const { documentLike } = fixture();
  const announcements = [];
  const coordinator = createGuidanceInterfaceCoordinator({
    documentLike,
    storage: memoryStorage(),
    onAnnouncement: event => announcements.push(event.text),
  });
  const long = 'Arrival '.repeat(40);
  assert.equal(coordinator.announce(long).announced, true);
  assert.equal(coordinator.announce(long).announced, false);
  assert.equal(announcements.length, 1);
  assert.ok(announcements[0].length <= 160);
});

test('viewport updates stay finite and preserve a stable snapshot', () => {
  const { documentLike } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage(), viewportWidth: 900 });
  coordinator.setViewportWidth(Number.NaN);
  assert.equal(coordinator.snapshot().settings.viewportWidth, 900);
  coordinator.setViewportWidth(420);
  assert.equal(coordinator.snapshot().settings.viewportWidth, 420);
});

test('missing DOM and failing callbacks remain bounded', () => {
  const documentLike = { getElementById() { return null; } };
  const coordinator = createGuidanceInterfaceCoordinator({
    documentLike,
    storage: memoryStorage(),
    onAnnouncement() { throw new Error('detached'); },
  });
  assert.doesNotThrow(() => coordinator.render());
  assert.doesNotThrow(() => coordinator.dispatchHelp({ type: 'toggle-help' }));
  assert.doesNotThrow(() => coordinator.announce('Approaching the old tower.'));
});

test('dispose is deterministic and blocks later dispatch', () => {
  const { documentLike } = fixture();
  const coordinator = createGuidanceInterfaceCoordinator({ documentLike, storage: memoryStorage() });
  const first = coordinator.dispose();
  const second = coordinator.dispose();
  const routed = coordinator.dispatchHelp({ type: 'toggle-help' });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(routed.routed, false);
  assert.equal(Object.isFrozen(coordinator.snapshot()), true);
});
