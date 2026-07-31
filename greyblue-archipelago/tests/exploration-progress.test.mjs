import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/exploration-progress.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  normalizeExplorationEvent,
  restoreExplorationProgress,
  recordExplorationEvent,
  serializeExplorationProgress,
  explorationTelemetry,
} = await import(moduleUrl);

assert.equal(normalizeExplorationEvent({ kind: "toast", id: "x" }), null);
assert.equal(normalizeExplorationEvent({ kind: "region-entered", id: " " }), null);
assert.deepEqual(normalizeExplorationEvent({
  kind: "landmark-reached",
  id: " landmark:a ",
  regionId: "region:west",
  occurredAt: 44.9,
}), {
  key: "landmark-reached:landmark:a",
  kind: "landmark-reached",
  id: "landmark:a",
  occurredAt: 44,
  regionId: "region:west",
});

let progress = restoreExplorationProgress({
  version: 99,
  events: [
    { kind: "region-entered", id: "region:west", occurredAt: 20 },
    { kind: "region-entered", id: "region:west", occurredAt: 30 },
    { kind: "route-completed", id: "route:1", occurredAt: 10 },
    { kind: "invalid", id: "discard-me", occurredAt: 1 },
  ],
});
assert.deepEqual(progress.events.map((event) => event.key), [
  "route-completed:route:1",
  "region-entered:region:west",
]);
assert.equal(progress.events[1].occurredAt, 20, "the earliest durable observation wins deterministically");

let result = recordExplorationEvent(progress, {
  kind: "landmark-reached",
  id: "landmark:a",
  regionId: "region:west",
  occurredAt: 40,
});
assert.equal(result.added, true);
progress = result.progress;

result = recordExplorationEvent(progress, {
  kind: "landmark-reached",
  id: "landmark:a",
  occurredAt: 999,
});
assert.equal(result.added, false, "repeated proximity frames cannot duplicate a durable arrival");
assert.equal(result.progress.events.length, 3);

const serialized = serializeExplorationProgress(progress);
assert.equal(serialized.version, 1);
assert.equal(Object.hasOwn(serialized, "keys"), false, "transient indexes are never persisted");
assert.equal(Object.hasOwn(serialized, "lastEvent"), false, "transient presentation state is never persisted");
assert.doesNotThrow(() => JSON.stringify(serialized));

const restored = restoreExplorationProgress(JSON.parse(JSON.stringify(serialized)));
assert.deepEqual(restored.events, progress.events, "save and reload preserve durable exploration order");

const telemetry = explorationTelemetry(restored);
assert.deepEqual(telemetry.completedCounts, { regions: 1, landmarks: 1, routes: 1 });
assert.equal(telemetry.eventCount, 3);
assert.equal(telemetry.lastDurableDiscovery.key, "landmark-reached:landmark:a");

console.log("exploration progress tests passed");
