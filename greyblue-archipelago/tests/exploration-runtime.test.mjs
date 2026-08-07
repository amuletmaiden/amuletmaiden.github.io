import assert from "node:assert/strict";
import test from "node:test";

import { createExplorationRuntime } from "../src/core/exploration-runtime.js";

const WORLD = Object.freeze({
  regions: Object.freeze([
    Object.freeze({ id: "hushed-reach" }),
    Object.freeze({ id: "far-choir" }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: "route:hushed-reach:0" }),
  ]),
  islands: Object.freeze([
    Object.freeze({
      id: "isle-0",
      landmarkRecord: Object.freeze({ id: "isle-0:landmark" }),
    }),
  ]),
});

function makeRuntime(options = {}) {
  let timestamp = 1000;
  const writes = [];
  const runtime = createExplorationRuntime({
    world: WORLD,
    restoredLedger: options.restoredLedger,
    now: options.now ?? (() => timestamp++),
    persist: options.persist ?? ((ledger, reason) => writes.push({ ledger, reason })),
  });
  return { runtime, writes };
}

test("restores durable exploration before accepting the first event", () => {
  const restoredLedger = {
    version: 1,
    events: [{
      kind: "region-entered",
      id: "hushed-reach",
      regionId: "hushed-reach",
      occurredAt: 20,
    }],
  };
  const { runtime } = makeRuntime({ restoredLedger });

  const duplicate = runtime.recordRegionEntry("hushed-reach");
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.equal(runtime.telemetry().restoredEventCount, 1);
  assert.equal(runtime.snapshot().events.length, 1);
});

test("records region and landmark arrivals idempotently", () => {
  const { runtime } = makeRuntime();

  assert.equal(runtime.recordRegionEntry("far-choir").accepted, true);
  assert.equal(runtime.recordLandmarkArrival("isle-0:landmark").accepted, true);
  assert.equal(runtime.recordLandmarkArrival("isle-0:landmark").reason, "duplicate");

  assert.deepEqual(runtime.telemetry().completedCounts, {
    regions: 1,
    landmarks: 1,
    routes: 0,
  });
});

test("rejects malformed and unknown stable world IDs", () => {
  const { runtime } = makeRuntime();

  assert.equal(runtime.recordRegionEntry(" ").reason, "invalid-id");
  assert.equal(runtime.recordRegionEntry("unknown-region").reason, "unknown-id");
  assert.equal(runtime.recordLandmarkArrival("isle-99:landmark").reason, "unknown-id");
  assert.equal(runtime.recordRouteCompletion("route:missing", true).reason, "unknown-id");
  assert.equal(runtime.snapshot().events.length, 0);
});

test("route completion requires an explicit completion signal", () => {
  const { runtime } = makeRuntime();

  const inferred = runtime.recordRouteCompletion("route:hushed-reach:0", false);
  assert.equal(inferred.accepted, false);
  assert.equal(inferred.reason, "explicit-signal-required");
  assert.equal(runtime.telemetry().completedCounts.routes, 0);

  const explicit = runtime.recordRouteCompletion("route:hushed-reach:0", true);
  assert.equal(explicit.accepted, true);
  assert.equal(runtime.telemetry().completedCounts.routes, 1);
});

test("snapshot ordering is deterministic when timestamps match", () => {
  const { runtime } = makeRuntime({ now: () => 500 });
  runtime.recordLandmarkArrival("isle-0:landmark");
  runtime.recordRegionEntry("hushed-reach");
  runtime.recordRouteCompletion("route:hushed-reach:0", true);

  assert.deepEqual(
    runtime.snapshot().events.map((event) => event.key),
    [
      "landmark-reached:isle-0:landmark",
      "region-entered:hushed-reach",
      "route-completed:route:hushed-reach:0",
    ],
  );
});

test("every integration-owned persistence reason flushes the same canonical ledger", () => {
  const { runtime, writes } = makeRuntime();
  runtime.recordRegionEntry("hushed-reach");
  runtime.recordLandmarkArrival("isle-0:landmark");

  for (const reason of ["periodic-save", "pause", "unload", "reset-recovery", "safe-respawn"]) {
    const result = runtime.flush(reason);
    assert.equal(result.persisted, true);
    assert.equal(result.flushReason, reason);
    assert.equal(result.snapshot.events.length, 2);
  }

  assert.deepEqual(writes.map((write) => write.reason), [
    "periodic-save",
    "pause",
    "unload",
    "reset-recovery",
    "safe-respawn",
  ]);
  assert.ok(writes.every((write) => write.ledger.events.length === 2));
});

test("unsupported flush reasons do not call persistence", () => {
  const { runtime, writes } = makeRuntime();
  runtime.recordRegionEntry("hushed-reach");

  const result = runtime.flush("proximity-frame");
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "unsupported-flush-reason");
  assert.equal(writes.length, 0);
});

test("persistence failure never discards durable exploration state", () => {
  const { runtime } = makeRuntime({
    persist() {
      throw new Error("storage unavailable");
    },
  });
  runtime.recordRegionEntry("hushed-reach");

  const result = runtime.flush("periodic-save");
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "persist-failed");
  assert.equal(runtime.snapshot().events.length, 1);
  assert.equal(runtime.telemetry().persistFailureCount, 1);
  assert.equal(runtime.telemetry().continuity, "degraded");
  assert.equal(runtime.telemetry().lastPersistError, "storage unavailable");
});

test("caller world and restored ledger remain untouched", () => {
  const worldBefore = JSON.stringify(WORLD);
  const restoredLedger = {
    version: 1,
    events: [{ kind: "region-entered", id: "hushed-reach", occurredAt: 10 }],
  };
  const ledgerBefore = JSON.stringify(restoredLedger);
  const { runtime } = makeRuntime({ restoredLedger });

  runtime.recordLandmarkArrival("isle-0:landmark");
  runtime.flush("safe-respawn");

  assert.equal(JSON.stringify(WORLD), worldBefore);
  assert.equal(JSON.stringify(restoredLedger), ledgerBefore);
});

test("snapshots and telemetry are bounded immutable JSON-safe data", () => {
  const { runtime } = makeRuntime();
  runtime.recordRegionEntry("hushed-reach");
  runtime.recordLandmarkArrival("isle-0:landmark");

  const snapshot = runtime.snapshot();
  const telemetry = runtime.telemetry();
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.events));
  assert.ok(Object.isFrozen(telemetry));
  assert.ok(Object.isFrozen(telemetry.completedCounts));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.doesNotThrow(() => JSON.stringify(telemetry));
  assert.equal(telemetry.eventCount, 2);
});

test("snapshot uses the canonical exploration save schema", () => {
  const { runtime } = makeRuntime();
  runtime.recordRegionEntry("hushed-reach");
  runtime.recordLandmarkArrival("isle-0:landmark");

  assert.deepEqual(runtime.snapshot(), {
    version: 1,
    events: [
      {
        key: "region-entered:hushed-reach",
        kind: "region-entered",
        id: "hushed-reach",
        occurredAt: 1000,
        regionId: "hushed-reach",
      },
      {
        key: "landmark-reached:isle-0:landmark",
        kind: "landmark-reached",
        id: "isle-0:landmark",
        occurredAt: 1001,
        landmarkId: "isle-0:landmark",
      },
    ],
  });
});
