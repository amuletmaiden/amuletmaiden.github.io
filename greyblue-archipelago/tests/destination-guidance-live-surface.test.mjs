import assert from 'node:assert/strict';
import test from 'node:test';
import { createDestinationGuidanceLiveSurface } from '../src/interface/destination-guidance-live-surface.js';

function element() {
  return {
    hidden: false,
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return this.children?.[selector] ?? null; },
  };
}

function fixture() {
  const root = element();
  const label = element();
  const status = element();
  const live = element();
  root.children = {
    '[data-greyblue-guidance-label]': label,
    '[data-greyblue-guidance-status]': status,
    '[data-greyblue-guidance-live]': live,
  };
  const documentRef = { querySelector: selector => selector === '[data-greyblue-guidance]' ? root : null };
  return { documentRef, root, label, status, live };
}

function guidance(overrides = {}) {
  return {
    destination: {
      id: 'bell-spire',
      name: 'Bell Spire',
      bearingDegrees: 20,
      distanceBand: 'near',
      phase: 'approach',
      motion: 'subtle',
      soundHookId: 'guidance:bell-spire',
      ...overrides.destination,
    },
    announcement: overrides.announcement ?? null,
  };
}

function mount(settings = {}) {
  return { viewportWidth: 1280, session: { settings: { verbosity: 'standard', reducedMotion: false, soundEnabled: true, ...settings } } };
}

test('renders restrained visible guidance into the published DOM seam', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  const result = surface.update({ guidance: guidance(), mountState: mount(), headingDegrees: 0 });
  assert.equal(result.reason, 'rendered');
  assert.equal(dom.root.hidden, false);
  assert.match(dom.label.textContent, /Bell Spire/);
  assert.match(dom.status.textContent, /Approaching/);
  assert.equal(dom.root.attributes['data-guidance-state'], 'approach');
});

test('repeated equivalent frames suppress DOM churn', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  surface.update({ guidance: guidance(), mountState: mount() });
  const repeated = surface.update({ guidance: guidance(), mountState: mount() });
  assert.equal(repeated.reason, 'unchanged');
  assert.equal(repeated.telemetry.renderCount, 1);
  assert.equal(repeated.telemetry.suppressedCount, 1);
});

test('publishes bounded polite atomic arrival announcements', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  surface.update({
    guidance: guidance({ destination: { phase: 'arrived', distanceBand: 'arrival' }, announcement: { id: 'arrive:bell-spire', kind: 'arrived' } }),
    mountState: mount(),
  });
  assert.equal(dom.live.textContent, 'Bell Spire reached.');
  assert.equal(dom.live.attributes.role, 'status');
  assert.equal(dom.live.attributes['aria-live'], 'polite');
  assert.equal(dom.live.attributes['aria-atomic'], 'true');
});

test('minimal mode remains hidden until arrival', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  surface.update({ guidance: guidance(), mountState: mount({ verbosity: 'minimal' }) });
  assert.equal(dom.root.hidden, true);
  surface.update({ guidance: guidance({ destination: { phase: 'arrived', distanceBand: 'arrival' } }), mountState: mount({ verbosity: 'minimal' }) });
  assert.equal(dom.root.hidden, false);
});

test('off mode suppresses presentation and marks the surface hidden', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  const result = surface.update({ guidance: guidance(), mountState: mount({ verbosity: 'off' }) });
  assert.equal(result.presentation.visible, false);
  assert.equal(dom.root.hidden, true);
  assert.equal(dom.root.attributes['aria-hidden'], 'true');
});

test('reduced motion preserves semantic content while disabling motion', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  surface.update({ guidance: guidance(), mountState: mount({ reducedMotion: true }) });
  assert.match(dom.label.textContent, /Bell Spire/);
  assert.equal(dom.root.attributes['data-guidance-motion'], 'none');
});

test('optional sound dispatch is independent and contained', () => {
  const dom = fixture();
  const sounds = [];
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef, dispatchSound: event => sounds.push(event) });
  surface.update({ guidance: guidance(), mountState: mount() });
  assert.deepEqual(sounds, [{ id: 'guidance:bell-spire', source: 'destination-guidance' }]);
  assert.ok(Object.isFrozen(sounds[0]));

  const silent = createDestinationGuidanceLiveSurface({ documentRef: fixture().documentRef, dispatchSound: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => silent.update({ guidance: guidance(), mountState: mount() }));
});

test('missing DOM recovers without throwing and reports incomplete binding', () => {
  const surface = createDestinationGuidanceLiveSurface({ documentRef: null });
  const result = surface.update({ guidance: guidance(), mountState: mount() });
  assert.equal(result.reason, 'rendered');
  assert.equal(result.telemetry.completeDom, false);
  assert.equal(result.telemetry.recoveryCount, 1);
});

test('clear and dispose are bounded and subsequent updates remain inert', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  surface.update({ guidance: guidance(), mountState: mount() });
  const cleared = surface.clear();
  assert.equal(cleared.reason, 'cleared');
  assert.equal(dom.root.hidden, true);
  assert.equal(dom.label.textContent, '');
  surface.dispose();
  const inert = surface.update({ guidance: guidance(), mountState: mount() });
  assert.equal(inert.reason, 'disposed');
  assert.equal(inert.disposed, true);
});

test('public snapshots are immutable and JSON-safe', () => {
  const dom = fixture();
  const surface = createDestinationGuidanceLiveSurface({ documentRef: dom.documentRef });
  const result = surface.update({ guidance: guidance(), mountState: mount() });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.telemetry));
  assert.doesNotThrow(() => JSON.stringify(result));
});
