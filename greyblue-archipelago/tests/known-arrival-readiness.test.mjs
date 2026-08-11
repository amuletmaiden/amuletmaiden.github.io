import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveKnownArrivalReadiness,
  knownArrivalReadinessInternals,
  publicKnownArrivalReadiness,
} from '../src/core/known-arrival-readiness.js';

const runtime = Object.freeze({
  ready: true,
  paused: false,
  recovery: false,
  restoring: false,
  restorePublication: false,
  crossing: false,
});

const validSurface = Object.freeze({
  valid: true,
  validity: 'valid',
  surface: 'terrain',
  height: 18,
});

function derive(overrides = {}) {
  return deriveKnownArrivalReadiness({
    runtime,
    voyageActive: true,
    known: true,
    approach: true,
    requested: true,
    resident: true,
    surfaceSample: validSurface,
    ...overrides,
  });
}

test('truthfully resident and sampleable known arrival stays silent', () => {
  assert.deepEqual(derive(), { active: false, state: null });
});

test('known requested arrival that is not resident reports loading only', () => {
  assert.deepEqual(derive({ resident: false, surfaceSample: null }), {
    active: true,
    state: 'loading',
  });
});

test('known arrival missing its continuity request is loading rather than invented ready terrain', () => {
  assert.deepEqual(derive({ requested: false }), {
    active: true,
    state: 'loading',
  });
});

test('resident known arrival with invalid terrain truth reports degraded', () => {
  assert.deepEqual(derive({
    surfaceSample: { valid: false, validity: 'missing', height: Number.NaN },
  }), {
    active: true,
    state: 'degraded',
  });
});

test('water cannot masquerade as an island landing surface', () => {
  assert.deepEqual(derive({
    surfaceSample: { valid: true, validity: 'valid', surface: 'water', height: 0 },
  }), {
    active: true,
    state: 'degraded',
  });
});

test('stale or non-finite surface samples remain degraded', () => {
  assert.equal(knownArrivalReadinessInternals.usableSurface({ validity: 'stale', height: 20 }), false);
  assert.equal(knownArrivalReadinessInternals.usableSurface({ validity: 'valid', height: Infinity }), false);
});

test('unknown arrival space is rejected before readiness publication', () => {
  assert.deepEqual(derive({ known: false, resident: false, surfaceSample: null }), {
    active: false,
    state: null,
  });
});

test('readiness is scoped to an active known voyage approach', () => {
  assert.deepEqual(derive({ voyageActive: false, resident: false }), { active: false, state: null });
  assert.deepEqual(derive({ approach: false, resident: false }), { active: false, state: null });
});

test('pause recovery restore and crossing clear the readiness surface', () => {
  for (const interrupted of [
    { paused: true },
    { recovery: true },
    { restoring: true },
    { restorePublication: true },
    { crossing: true },
  ]) {
    assert.deepEqual(derive({
      runtime: { ...runtime, ...interrupted },
      resident: false,
      surfaceSample: null,
    }), { active: false, state: null });
  }
});

test('truthful surface readiness automatically clears a previous degraded classification', () => {
  const degraded = derive({ surfaceSample: { validity: 'missing', height: Number.NaN } });
  const ready = derive({ surfaceSample: validSurface });
  assert.deepEqual(degraded, { active: true, state: 'degraded' });
  assert.deepEqual(ready, { active: false, state: null });
});

test('public projection strips all private-looking arrival evidence', () => {
  const projected = publicKnownArrivalReadiness({
    active: true,
    state: 'degraded',
    islandId: 'hidden-island',
    regionId: 'hidden-region',
    x: 99,
    z: -88,
    height: 42,
    retries: 7,
  });
  assert.deepEqual(projected, { active: true, state: 'degraded' });
  assert.deepEqual(Object.keys(projected), ['active', 'state']);
});

test('malformed public classifications fail closed', () => {
  assert.deepEqual(publicKnownArrivalReadiness({ active: true, state: 'ready' }), {
    active: false,
    state: null,
  });
  assert.deepEqual(publicKnownArrivalReadiness(null), {
    active: false,
    state: null,
  });
});

test('policy does not mutate caller-owned runtime or surface records', () => {
  const mutableRuntime = { ...runtime };
  const mutableSurface = { ...validSurface };
  const runtimeBefore = structuredClone(mutableRuntime);
  const surfaceBefore = structuredClone(mutableSurface);
  deriveKnownArrivalReadiness({
    runtime: mutableRuntime,
    voyageActive: true,
    known: true,
    approach: true,
    requested: true,
    resident: true,
    surfaceSample: mutableSurface,
  });
  assert.deepEqual(mutableRuntime, runtimeBefore);
  assert.deepEqual(mutableSurface, surfaceBefore);
});
