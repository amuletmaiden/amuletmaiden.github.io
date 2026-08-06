import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceLiveMount } from '../src/interface/guidance-live-mount.js';

function element() {
  return {
    children: [], attributes: {}, listeners: {}, textContent: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
  };
}

function harness() {
  const panel = element();
  const status = element();
  const nodes = { 'greyblue-guidance-settings': panel, 'greyblue-guidance-status': status };
  const storage = new Map();
  return {
    panel, status,
    storage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
    documentLike: {
      getElementById(id) { return nodes[id] ?? null; },
      createElement() { return element(); },
    },
  };
}

test('mount renders persisted settings into the live surface', () => {
  const h = harness();
  h.storage.setItem('greyblue.guidance', JSON.stringify({ mode: 'minimal', reducedMotion: true }));
  const mount = createGuidanceLiveMount(h);
  const result = mount.render();
  assert.equal(result.session.settings.mode, 'minimal');
  assert.equal(h.panel.attributes['data-guidance-mode'], 'minimal');
  assert.equal(h.panel.attributes['data-reduced-motion'], 'true');
});

test('control dispatch persists and rerenders once', () => {
  const h = harness();
  const mount = createGuidanceLiveMount(h);
  mount.render();
  const result = mount.dispatch({ type: 'set-mode', mode: 'off' });
  assert.equal(result.session.settings.mode, 'off');
  assert.equal(JSON.parse(h.storage.getItem('greyblue.guidance')).mode, 'off');
  assert.equal(result.telemetry.dispatches, 1);
});

test('close and viewport changes remain bounded', () => {
  const h = harness();
  const mount = createGuidanceLiveMount({ ...h, isOpen: true, viewportWidth: 900 });
  assert.equal(mount.dispatch({ type: 'close-settings' }).isOpen, false);
  const narrow = mount.setViewportWidth(400);
  assert.equal(narrow.surface.layout, 'stacked');
  assert.equal(narrow.telemetry.closes, 1);
});

test('unsupported actions do not mutate settings', () => {
  const h = harness();
  const mount = createGuidanceLiveMount(h);
  const before = mount.snapshot().session.settings;
  const after = mount.dispatch({ type: 'destroy-world' }).session.settings;
  assert.deepEqual(after, before);
});

test('announcement handoff reaches the polite live region', () => {
  const h = harness();
  const mount = createGuidanceLiveMount(h);
  const result = mount.announce({ id: 'arrival:pool', text: 'Listening Pool reached.' });
  assert.equal(result.announced, true);
  assert.equal(h.status.textContent, 'Listening Pool reached.');
});

test('missing DOM and malformed viewport recover safely', () => {
  const mount = createGuidanceLiveMount({ documentLike: { getElementById() { return null; } }, viewportWidth: NaN });
  const result = mount.render();
  assert.equal(result.viewportWidth, 1280);
  assert.equal(result.render.ready, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('snapshots expose immutable telemetry', () => {
  const mount = createGuidanceLiveMount({ documentLike: { getElementById() { return null; } } });
  const result = mount.snapshot();
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.telemetry), true);
});
