import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamedIslandPool } from '../src/core/streamed-island-pool.js';

function island(id, { landmark = false, x = 0, z = 0, scale = 1, height = 100 } = {}) {
  return { id, landmark, x, z, scale, height };
}

function harness(cap = 2) {
  let nextId = 1;
  const disposed = [];
  const pool = createStreamedIslandPool({
    cap,
    create(kind) { return { resourceId: nextId++, kind, state: null }; },
    reset(resource, value, kind) {
      resource.kind = kind;
      resource.state = value ? { ...value } : null;
    },
    dispose(resource) { disposed.push(resource.resourceId); },
  });
  return { pool, disposed };
}

test('reuses released ordinary presentation without changing active membership', () => {
  const { pool } = harness();
  const [first] = pool.sync([island('a')]);
  assert.equal(pool.telemetry().created, 1);
  pool.sync([]);
  const [second] = pool.sync([island('b', { x: 12, z: 8, scale: 1.5, height: 120 })]);
  assert.equal(second.resourceId, first.resourceId);
  assert.equal(second.state.id, 'b');
  assert.equal(second.state.x, 12);
  assert.deepEqual(pool.telemetry(), {
    active: 1, pooled: 0, created: 1, reused: 1, disposed: 0, rejected: 0, cap: 2,
  });
});

test('keeps landmark and ordinary presentation classes separate', () => {
  const { pool } = harness(4);
  const [ordinary] = pool.sync([island('ordinary')]);
  pool.sync([]);
  const [landmark] = pool.sync([island('landmark', { landmark: true })]);
  assert.notEqual(landmark.resourceId, ordinary.resourceId);
  assert.equal(landmark.kind, 'landmark');
  assert.equal(pool.telemetry().created, 2);
  assert.equal(pool.telemetry().reused, 0);
});

test('pool cap disposes surplus resources', () => {
  const { pool, disposed } = harness(1);
  pool.sync([island('a'), island('b')]);
  pool.sync([]);
  assert.equal(pool.telemetry().pooled, 1);
  assert.equal(pool.telemetry().disposed, 1);
  assert.equal(disposed.length, 1);
});

test('release reset clears prior island state before reuse', () => {
  const { pool } = harness();
  const [first] = pool.sync([island('a', { x: 99, z: -20 })]);
  pool.sync([]);
  assert.equal(first.state, null);
  const [reused] = pool.sync([island('b')]);
  assert.deepEqual(reused.state, island('b'));
});

test('malformed and duplicate inputs fail closed without mutating callers', () => {
  const { pool } = harness();
  const valid = island('a');
  const input = [valid, valid, { id: 'bad', x: NaN, z: 0, scale: 1, height: 1 }, null];
  const before = structuredClone(valid);
  const resources = pool.sync(input);
  assert.equal(resources.length, 1);
  assert.deepEqual(valid, before);
  assert.equal(pool.telemetry().active, 1);
});

test('teardown disposes active and pooled resources exactly once', () => {
  const { pool, disposed } = harness(3);
  pool.sync([island('a'), island('b', { landmark: true })]);
  pool.release('a');
  pool.teardown();
  assert.equal(new Set(disposed).size, 2);
  assert.equal(disposed.length, 2);
  assert.equal(pool.telemetry().active, 0);
  assert.equal(pool.telemetry().pooled, 0);
  assert.equal(pool.telemetry().disposed, 2);
});
