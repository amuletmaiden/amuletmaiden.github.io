import assert from "node:assert/strict";
import test from "node:test";
import { createOptionalSurfaceReadiness } from "../src/core/optional-surface-readiness.js";

test("full optional boot reports ready without degradation", async () => {
  const calls = [];
  const readiness = createOptionalSurfaceReadiness([
    { id: "journal", load: async () => calls.push("journal") },
    { id: "soundscape", load: async () => calls.push("soundscape") },
  ]);

  const snapshot = await readiness.loadAll();
  assert.deepEqual(calls, ["journal", "soundscape"]);
  assert.deepEqual(snapshot, {
    ready: true,
    degraded: false,
    failedOptionalSurfaceIds: [],
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.failedOptionalSurfaceIds));
});

test("one optional failure does not prevent later surfaces", async () => {
  const calls = [];
  const readiness = createOptionalSurfaceReadiness([
    { id: "journal", load: async () => { calls.push("journal"); throw new Error("missing"); } },
    { id: "soundscape", load: async () => calls.push("soundscape") },
  ]);

  const snapshot = await readiness.loadAll();
  assert.deepEqual(calls, ["journal", "soundscape"]);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.degraded, true);
  assert.deepEqual(snapshot.failedOptionalSurfaceIds, ["journal"]);
});

test("multiple failures have stable bounded ordering", async () => {
  const descriptors = ["zeta", "alpha", "middle"].map((id) => ({
    id,
    load: async () => { throw new Error(id); },
  }));
  const snapshot = await createOptionalSurfaceReadiness(descriptors).loadAll();
  assert.deepEqual(snapshot.failedOptionalSurfaceIds, ["alpha", "middle", "zeta"]);
});

test("malformed and duplicate descriptors fail closed without mutating caller input", async () => {
  const descriptor = { id: "Journal", load: async () => {} };
  const input = [descriptor, descriptor, null, {}, { id: "bad id", load: async () => {} }];
  const before = input.slice();
  const readiness = createOptionalSurfaceReadiness(input);

  assert.deepEqual(readiness.descriptors.map(({ id }) => id), ["journal"]);
  assert.deepEqual(input, before);
  assert.equal(input[0], descriptor);
});

test("readiness snapshots stay JSON-safe and bounded", async () => {
  const descriptors = Array.from({ length: 20 }, (_, index) => ({
    id: `surface-${String(index).padStart(2, "0")}`,
    load: async () => { throw new Error("boom"); },
  }));
  const snapshot = await createOptionalSurfaceReadiness(descriptors).loadAll();
  const roundTrip = JSON.parse(JSON.stringify(snapshot));

  assert.equal(roundTrip.failedOptionalSurfaceIds.length, 12);
  assert.equal(roundTrip.ready, true);
  assert.equal(roundTrip.degraded, true);
});
