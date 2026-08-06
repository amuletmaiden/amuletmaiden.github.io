import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceDomBinding } from '../src/interface/guidance-dom-binding.js';

function element(tagName = 'div') {
  return {
    tagName,
    children: [],
    attributes: {},
    listeners: {},
    textContent: '',
    disabled: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
  };
}

function harness({ panel = element(), status = element() } = {}) {
  const nodes = {
    'greyblue-guidance-settings': panel,
    'greyblue-guidance-status': status,
  };
  return {
    panel,
    status,
    documentLike: {
      getElementById(id) { return nodes[id] ?? null; },
      createElement(tagName) { return element(tagName); },
    },
  };
}

const surface = {
  title: 'Guidance',
  layout: 'stacked',
  controls: [
    { id: 'mode-minimal', label: 'Minimal', selected: true, action: { type: 'select-mode', mode: 'minimal' } },
    { id: 'sound', label: 'Sound', kind: 'toggle', selected: false, action: { type: 'toggle-sound' } },
  ],
};

test('renders a restrained accessible settings surface', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  const result = binding.render(surface, { mode: 'minimal', reducedMotion: true, soundEnabled: false });

  assert.equal(result.changed, true);
  assert.equal(h.panel.children.length, 3);
  assert.equal(h.panel.children[0].textContent, 'Guidance');
  assert.equal(h.panel.attributes['data-layout'], 'stacked');
  assert.equal(h.panel.attributes['data-guidance-mode'], 'minimal');
  assert.equal(h.panel.attributes['data-reduced-motion'], 'true');
  assert.equal(h.status.attributes['aria-live'], 'polite');
});

test('routes supported control clicks without mutating actions', () => {
  const h = harness();
  const received = [];
  const action = surface.controls[0].action;
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike, dispatch: (value) => received.push(value) });
  binding.render(surface, { mode: 'minimal' });
  h.panel.children[1].listeners.click();

  assert.deepEqual(received, [{ type: 'select-mode', mode: 'minimal' }]);
  assert.deepEqual(action, { type: 'select-mode', mode: 'minimal' });
});

test('suppresses unchanged render churn', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  binding.render(surface, { mode: 'minimal' });
  const result = binding.render(surface, { mode: 'minimal' });

  assert.equal(result.changed, false);
  assert.equal(result.telemetry.renderCount, 1);
});

test('deduplicates polite announcements', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  const first = binding.announce({ id: 'arrival:spire', text: 'The glass spire is reached.' });
  const second = binding.announce({ id: 'arrival:spire', text: 'The glass spire is reached.' });

  assert.equal(first.announced, true);
  assert.equal(second.announced, false);
  assert.equal(h.status.textContent, 'The glass spire is reached.');
  assert.equal(second.telemetry.duplicateAnnouncements, 1);
});

test('respects announcement permission and bounds text', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  assert.equal(binding.announce({ id: 'hidden', text: 'No', permitted: false }).announced, false);
  const longText = 'a'.repeat(400);
  binding.announce({ id: 'long', text: longText });
  assert.equal(h.status.textContent.length, 240);
});

test('recovers when DOM nodes are absent', () => {
  const documentLike = { getElementById() { return null; }, createElement: undefined };
  const binding = createGuidanceDomBinding({ documentLike });
  const render = binding.render(surface, { mode: 'unknown' });
  const announcement = binding.announce({ id: 'x', text: 'hello' });

  assert.equal(render.ready, false);
  assert.equal(render.telemetry.missingPanel, true);
  assert.equal(render.telemetry.missingStatus, true);
  assert.equal(announcement.announced, false);
});

test('malformed surface input remains finite and JSON-safe', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  const result = binding.render({ title: null, controls: [null, { label: 7 }, ...Array(20).fill({})] }, null);

  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(result.telemetry.renderCount, 1);
  assert.ok(h.panel.children.length <= 9);
});

test('disabled controls never dispatch', () => {
  const h = harness();
  let calls = 0;
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike, dispatch: () => { calls += 1; } });
  binding.render({ controls: [{ id: 'off', label: 'Off', disabled: true, action: { type: 'select-mode', mode: 'off' } }] });
  const control = h.panel.children[1];

  assert.equal(control.disabled, true);
  assert.equal(control.listeners.click, undefined);
  assert.equal(calls, 0);
});

test('snapshots expose immutable bounded telemetry', () => {
  const h = harness();
  const binding = createGuidanceDomBinding({ documentLike: h.documentLike });
  const snapshot = binding.snapshot();

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.telemetry), true);
  assert.equal(Object.isFrozen(snapshot.ids), true);
});
