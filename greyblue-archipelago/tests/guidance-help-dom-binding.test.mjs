import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceHelpDomBinding } from '../src/interface/guidance-help-dom-binding.js';

function node() {
  const listeners = new Map();
  return {
    attributes: {},
    hidden: false,
    disabled: false,
    textContent: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    setAttribute(name, value) { this.attributes[name] = value; },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    listenerCount() { return listeners.size; },
  };
}

function fixture({ missing = [] } = {}) {
  const nodes = {
    'greyblue-guidance-help-trigger': node(),
    'greyblue-guidance-help': node(),
    'greyblue-guidance-help-status': node(),
  };
  for (const id of missing) delete nodes[id];
  const documentLike = node();
  documentLike.getElementById = id => nodes[id] ?? null;
  return { documentLike, nodes };
}

function state(overrides = {}) {
  return {
    open: false,
    shortcut: 'G',
    trigger: { label: 'Guidance help', expanded: false, controls: 'greyblue-guidance-help' },
    panel: {
      id: 'greyblue-guidance-help',
      hidden: true,
      role: 'region',
      label: 'Guidance help',
      text: 'Press G to toggle guidance help.',
    },
    announcement: null,
    ...overrides,
  };
}

test('renders explicit trigger, panel, and polite status semantics', () => {
  const { documentLike, nodes } = fixture();
  const binding = createGuidanceHelpDomBinding({ documentLike });
  const result = binding.render(state());
  assert.equal(result.changed, true);
  assert.equal(nodes['greyblue-guidance-help-trigger'].textContent, 'Guidance help');
  assert.equal(nodes['greyblue-guidance-help-trigger'].attributes['aria-expanded'], 'false');
  assert.equal(nodes['greyblue-guidance-help-trigger'].attributes['aria-keyshortcuts'], 'G');
  assert.equal(nodes['greyblue-guidance-help'].hidden, true);
  assert.equal(nodes['greyblue-guidance-help'].attributes.role, 'region');
  assert.equal(nodes['greyblue-guidance-help-status'].attributes['aria-live'], 'polite');
});

test('click routes toggle and renders returned state', () => {
  const { documentLike, nodes } = fixture();
  const actions = [];
  const binding = createGuidanceHelpDomBinding({
    documentLike,
    dispatch(action) {
      actions.push(action);
      return state({
        open: true,
        trigger: { label: 'Guidance help', expanded: true, controls: 'greyblue-guidance-help' },
        panel: { ...state().panel, hidden: false },
        announcement: 'Guidance help opened.',
      });
    },
  });
  binding.render(state());
  nodes['greyblue-guidance-help-trigger'].emit('click');
  assert.equal(actions.at(-1).type, 'toggle-help');
  assert.equal(nodes['greyblue-guidance-help'].hidden, false);
  assert.equal(nodes['greyblue-guidance-help-status'].textContent, 'Guidance help opened.');
});

test('shortcut and Escape routing prevent default without modifier collisions', () => {
  const { documentLike } = fixture();
  const actions = [];
  const binding = createGuidanceHelpDomBinding({ documentLike, dispatch: action => actions.push(action) });
  binding.render(state());
  let prevented = 0;
  documentLike.emit('keydown', { key: 'g', preventDefault() { prevented += 1; } });
  documentLike.emit('keydown', { key: 'Escape', preventDefault() { prevented += 1; } });
  documentLike.emit('keydown', { key: 'g', ctrlKey: true, preventDefault() { prevented += 1; } });
  assert.deepEqual(actions.map(action => action.type), ['shortcut', 'escape']);
  assert.equal(prevented, 2);
});

test('focus and blur are routed with stable control identity', () => {
  const { documentLike, nodes } = fixture();
  const actions = [];
  const binding = createGuidanceHelpDomBinding({ documentLike, dispatch: action => actions.push(action) });
  nodes['greyblue-guidance-help-trigger'].emit('focus');
  nodes['greyblue-guidance-help-trigger'].emit('blur');
  assert.deepEqual(actions, [
    { type: 'focus', controlId: 'greyblue-guidance-help-trigger' },
    { type: 'blur' },
  ]);
  assert.equal(binding.inspect().telemetry.dispatchCount, 2);
});

test('duplicate renders and announcements are suppressed', () => {
  const { documentLike } = fixture();
  const binding = createGuidanceHelpDomBinding({ documentLike });
  const next = state({ announcement: 'Guidance help opened.' });
  binding.render(next);
  const duplicate = binding.render(next);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.telemetry.renderCount, 1);
  assert.equal(duplicate.telemetry.announcementCount, 1);
  assert.equal(duplicate.telemetry.duplicateRenders, 1);
});

test('malformed state is normalized and bounded', () => {
  const { documentLike, nodes } = fixture();
  const binding = createGuidanceHelpDomBinding({ documentLike });
  assert.doesNotThrow(() => binding.render({
    shortcut: 4,
    trigger: null,
    panel: { text: 'x'.repeat(600) },
    announcement: 9,
  }));
  assert.equal(nodes['greyblue-guidance-help-trigger'].attributes['aria-keyshortcuts'], 'G');
  assert.equal(nodes['greyblue-guidance-help'].textContent.length, 320);
});

test('missing DOM nodes are tolerated and readiness remains explicit', () => {
  const { documentLike } = fixture({ missing: [
    'greyblue-guidance-help-trigger',
    'greyblue-guidance-help',
    'greyblue-guidance-help-status',
  ] });
  const binding = createGuidanceHelpDomBinding({ documentLike });
  assert.doesNotThrow(() => binding.render(state()));
  assert.equal(binding.inspect().ready, false);
});

test('dispatch failures are contained so help cannot interrupt play', () => {
  const { documentLike, nodes } = fixture();
  const binding = createGuidanceHelpDomBinding({
    documentLike,
    dispatch() { throw new Error('detached controller'); },
  });
  assert.doesNotThrow(() => nodes['greyblue-guidance-help-trigger'].emit('click'));
  assert.equal(binding.inspect().telemetry.dispatchCount, 1);
});

test('dispose removes listeners and makes routing inert', () => {
  const { documentLike, nodes } = fixture();
  const actions = [];
  const binding = createGuidanceHelpDomBinding({ documentLike, dispatch: action => actions.push(action) });
  const disposed = binding.dispose();
  assert.equal(disposed.changed, true);
  assert.equal(nodes['greyblue-guidance-help-trigger'].disabled, true);
  assert.equal(nodes['greyblue-guidance-help'].hidden, true);
  assert.equal(nodes['greyblue-guidance-help-trigger'].listenerCount(), 0);
  nodes['greyblue-guidance-help-trigger'].emit('click');
  assert.equal(actions.length, 0);
  assert.equal(binding.route({ type: 'toggle-help' }).reason, 'disposed');
});

test('snapshots are immutable and JSON safe', () => {
  const { documentLike } = fixture();
  const binding = createGuidanceHelpDomBinding({ documentLike });
  const snapshot = binding.inspect();
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.ids));
  assert.ok(Object.isFrozen(snapshot.telemetry));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});
