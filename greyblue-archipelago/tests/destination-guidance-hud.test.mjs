import assert from 'node:assert/strict';
import test from 'node:test';
import { createDestinationGuidanceHud } from '../src/interface/destination-guidance-hud.js';

function fakeDocument() {
  const byId = new Map();
  const body = node('body', byId);
  return {
    body,
    createElement(tag) { return node(tag, byId); },
    querySelector(selector) {
      if (selector.startsWith('#')) return byId.get(selector.slice(1)) ?? null;
      if (selector === '[data-greyblue-overlay]') return body;
      return body.querySelector(selector);
    },
  };
}

function node(tag, byId) {
  const attributes = new Map();
  const children = [];
  let internalId = '';
  return {
    tagName: tag.toUpperCase(),
    hidden: false,
    textContent: '',
    parentNode: null,
    get id() { return internalId; },
    set id(value) {
      if (internalId) byId.delete(internalId);
      internalId = String(value);
      if (internalId) byId.set(internalId, this);
    },
    appendChild(child) { child.parentNode = this; children.push(child); return child; },
    removeChild(child) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); child.parentNode = null; return child; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    querySelector(selector) {
      if (selector.startsWith('#')) return byId.get(selector.slice(1)) ?? null;
      const attr = selector.match(/^\[([^\]]+)\]$/)?.[1];
      if (!attr) return null;
      return walk(children, child => child.getAttribute(attr) !== null);
    },
    children,
  };
}

function walk(children, predicate) {
  for (const child of children) {
    if (predicate(child)) return child;
    const nested = walk(child.children ?? [], predicate);
    if (nested) return nested;
  }
  return null;
}

function input(overrides = {}) {
  return {
    guidance: {
      destination: {
        id: 'bell-spire',
        name: 'Bell Spire',
        bearingDegrees: 35,
        distanceBand: 'near',
        phase: 'approach',
        motion: 'subtle',
        soundHookId: 'guidance:bell-spire',
      },
      announcement: { id: 'approach:bell-spire', kind: 'approach' },
    },
    mountState: { viewportWidth: 1280, session: { settings: { verbosity: 'standard', reducedMotion: false, soundEnabled: true } } },
    headingDegrees: 0,
    viewportWidth: 1280,
    ...overrides,
  };
}

test('creates a concrete player-visible guidance HUD under the overlay host', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  const state = hud.inspect();
  assert.equal(state.mounted, true);
  assert.equal(state.created, true);
  assert.ok(documentRef.querySelector('#greyblue-destination-guidance'));
  assert.ok(documentRef.querySelector('#greyblue-destination-guidance-label'));
  assert.ok(documentRef.querySelector('#greyblue-destination-guidance-status'));
  assert.ok(documentRef.querySelector('#greyblue-destination-guidance-live'));
});

test('renders destination label and keyboard-readable status', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  const result = hud.update(input());
  const root = documentRef.querySelector('#greyblue-destination-guidance');
  const label = documentRef.querySelector('#greyblue-destination-guidance-label');
  const status = documentRef.querySelector('#greyblue-destination-guidance-status');
  assert.equal(result.surface.reason, 'rendered');
  assert.equal(root.hidden, false);
  assert.match(label.textContent, /Bell Spire/);
  assert.match(status.textContent, /Approaching/);
});

test('narrow viewport switches the HUD to compact layout', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  hud.update(input({ viewportWidth: 420, mountState: { viewportWidth: 420, session: { settings: { verbosity: 'standard' } } } }));
  const root = documentRef.querySelector('#greyblue-destination-guidance');
  assert.equal(root.getAttribute('data-guidance-layout'), 'compact');
});

test('guidance-off state hides the concrete HUD without destroying it', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  hud.update(input({ mountState: { session: { settings: { verbosity: 'off' } } } }));
  const root = documentRef.querySelector('#greyblue-destination-guidance');
  assert.equal(root.hidden, true);
  assert.equal(root.getAttribute('aria-hidden'), 'true');
});

test('arrival announcement is routed through the polite live region once', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  const arrival = input();
  arrival.guidance.destination.phase = 'arrived';
  arrival.guidance.destination.distanceBand = 'arrival';
  arrival.guidance.announcement = { id: 'arrival:bell-spire', kind: 'arrived' };
  hud.update(arrival);
  const live = documentRef.querySelector('#greyblue-destination-guidance-live');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.match(live.textContent, /reached/);
  const repeated = hud.update(arrival);
  assert.equal(repeated.surface.presentation.announcement, null);
});

test('optional sound dispatch cannot break semantic HUD rendering', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef, dispatchSound() { throw new Error('audio unavailable'); } });
  assert.doesNotThrow(() => hud.update(input()));
  assert.match(documentRef.querySelector('#greyblue-destination-guidance-label').textContent, /Bell Spire/);
});

test('missing DOM degrades to bounded telemetry without throwing', () => {
  const hud = createDestinationGuidanceHud({ documentRef: null, host: null });
  const result = hud.update(input());
  assert.equal(result.mounted, false);
  assert.equal(result.surface.telemetry.completeDom, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('dispose removes only HUD nodes created by this mount', () => {
  const documentRef = fakeDocument();
  const hud = createDestinationGuidanceHud({ documentRef });
  assert.ok(documentRef.querySelector('#greyblue-destination-guidance'));
  const result = hud.dispose();
  assert.equal(result.disposed, true);
  assert.equal(documentRef.body.children.length, 0);
});

test('equivalent updates remain deterministic and snapshots are frozen', () => {
  const leftDocument = fakeDocument();
  const rightDocument = fakeDocument();
  const left = createDestinationGuidanceHud({ documentRef: leftDocument }).update(input());
  const right = createDestinationGuidanceHud({ documentRef: rightDocument }).update(input());
  assert.deepEqual(left.surface.presentation, right.surface.presentation);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.surface), true);
});
