import assert from 'node:assert/strict';
import test from 'node:test';
import { presentDestinationGuidance } from '../src/interface/destination-guidance-presentation.js';

function guidance(overrides = {}) {
  return {
    destination: {
      id: 'listening-pool',
      name: 'Listening Pool',
      bearingDegrees: 90,
      distanceBand: 'mid',
      phase: 'en-route',
      motion: 'subtle',
      soundHookId: 'guidance:listening-pool',
      ...overrides.destination,
    },
    announcement: overrides.announcement ?? null,
  };
}

function mount(settings = {}, viewportWidth = 1280) {
  return { viewportWidth, session: { settings: { verbosity: 'standard', reducedMotion: false, soundEnabled: true, ...settings } } };
}

test('standard guidance presents destination, bearing, distance and keyboard state', () => {
  const result = presentDestinationGuidance({ guidance: guidance(), mountState: mount(), headingDegrees: 0 });
  assert.equal(result.visible, true);
  assert.match(result.label, /Listening Pool/);
  assert.equal(result.destination.bearingLabel, 'Right');
  assert.equal(result.destination.distanceBand, 'mid');
  assert.match(result.keyboardText, /En route/);
});

test('minimal guidance remains arrival-only', () => {
  const enRoute = presentDestinationGuidance({ guidance: guidance(), mountState: mount({ verbosity: 'minimal' }) });
  assert.equal(enRoute.visible, false);
  assert.equal(enRoute.telemetry.reason, 'arrival-only');
  const arrived = presentDestinationGuidance({
    guidance: guidance({ destination: { phase: 'arrived', distanceBand: 'arrival' } }),
    mountState: mount({ verbosity: 'minimal' }),
  });
  assert.equal(arrived.visible, true);
});

test('guidance off suppresses visual, announcement, sound and motion', () => {
  const result = presentDestinationGuidance({ guidance: guidance(), mountState: mount({ verbosity: 'off' }) });
  assert.equal(result.visible, false);
  assert.equal(result.announcement, null);
  assert.equal(result.soundHookId, null);
  assert.equal(result.motion, 'none');
});

test('reduced motion preserves semantic guidance', () => {
  const result = presentDestinationGuidance({ guidance: guidance(), mountState: mount({ reducedMotion: true }) });
  assert.equal(result.visible, true);
  assert.equal(result.destination.id, 'listening-pool');
  assert.equal(result.motion, 'none');
});

test('repeated frame suppresses duplicate announcement and text churn', () => {
  const first = presentDestinationGuidance({
    guidance: guidance({ announcement: { id: 'approach:listening-pool', kind: 'approach' } }),
    mountState: mount(),
  });
  const repeated = presentDestinationGuidance({
    guidance: guidance({ announcement: { id: 'approach:listening-pool', kind: 'approach' } }),
    mountState: mount(),
    previousPresentation: first.state,
  });
  assert.equal(repeated.announcement, null);
  assert.equal(repeated.telemetry.duplicateSuppressed, true);
  assert.equal(repeated.telemetry.changed, false);
});

test('destination changes create a new stable presentation signature', () => {
  const first = presentDestinationGuidance({ guidance: guidance(), mountState: mount() });
  const next = presentDestinationGuidance({
    guidance: guidance({ destination: { id: 'bell-spire', name: 'Bell Spire' } }),
    mountState: mount(),
    previousPresentation: first.state,
  });
  assert.equal(next.telemetry.changed, true);
  assert.equal(next.destination.id, 'bell-spire');
});

test('approach to arrival transition publishes restrained arrival intent', () => {
  const approach = presentDestinationGuidance({
    guidance: guidance({ destination: { phase: 'approach', distanceBand: 'near' }, announcement: { id: 'approach:listening-pool', kind: 'approach' } }),
    mountState: mount(),
  });
  const arrival = presentDestinationGuidance({
    guidance: guidance({ destination: { phase: 'arrived', distanceBand: 'arrival' }, announcement: { id: 'arrival:listening-pool', kind: 'arrived' } }),
    mountState: mount(),
    previousPresentation: approach.state,
  });
  assert.equal(arrival.announcement.id, 'arrival:listening-pool');
  assert.match(arrival.announcement.text, /reached/);
  assert.equal(arrival.telemetry.changed, true);
});

test('sound disabled preserves visual and announcement semantics', () => {
  const result = presentDestinationGuidance({
    guidance: guidance({ announcement: { id: 'approach:listening-pool', kind: 'approach' } }),
    mountState: mount({ soundEnabled: false }),
  });
  assert.equal(result.visible, true);
  assert.ok(result.announcement);
  assert.equal(result.soundHookId, null);
});

test('malformed snapshot recovers to bounded no-destination state', () => {
  const result = presentDestinationGuidance({ guidance: { destination: { id: ' ' } }, mountState: { session: { settings: { verbosity: 'broken' } } } });
  assert.equal(result.destination, null);
  assert.equal(result.telemetry.reason, 'no-destination');
  assert.equal(result.telemetry.recovered, true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('empty destination remains keyboard readable', () => {
  const result = presentDestinationGuidance({ guidance: {}, mountState: mount() });
  assert.equal(result.visible, false);
  assert.equal(result.keyboardText, 'No destination selected.');
});

test('narrow viewport uses compact labels', () => {
  const result = presentDestinationGuidance({ guidance: guidance(), mountState: mount({}, 420) });
  assert.equal(result.telemetry.compact, true);
  assert.equal(result.label, 'Listening Pool · Right · Mid-distance');
});

test('caller inputs remain immutable', () => {
  const sourceGuidance = guidance();
  const sourceMount = mount();
  const before = JSON.stringify({ sourceGuidance, sourceMount });
  presentDestinationGuidance({ guidance: sourceGuidance, mountState: sourceMount });
  assert.equal(JSON.stringify({ sourceGuidance, sourceMount }), before);
});

test('equivalent inputs produce deterministic frozen output', () => {
  const input = { guidance: guidance(), mountState: mount(), headingDegrees: 25 };
  const left = presentDestinationGuidance(input);
  const right = presentDestinationGuidance(input);
  assert.deepEqual(left, right);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.destination), true);
  assert.equal(Object.isFrozen(left.telemetry), true);
});
