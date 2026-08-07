import assert from "node:assert/strict";
import { createExplorationLifecycle, investigatedLandmarkIdsFromExploration } from "../src/core/exploration-lifecycle.js";

const lifecycle = createExplorationLifecycle({
  version: 1,
  events: [
    { kind: "region-entered", id: "hushed-reach", regionId: "hushed-reach", occurredAt: 20 },
    { kind: "region-entered", id: "hushed-reach", regionId: "hushed-reach", occurredAt: 30 },
  ],
});

assert.equal(lifecycle.dirty, false);
assert.equal(lifecycle.recordRegion({ id: "hushed-reach" }, 40), false);
assert.equal(lifecycle.recordRegion({ id: "blueglass-wake" }, 50), true);
assert.equal(lifecycle.recordLandmark({ id: "isle-9:landmark" }, "blueglass-wake", 60), true);
assert.equal(lifecycle.recordLandmark({ id: "isle-9:landmark" }, "blueglass-wake", 70), false);
assert.equal(lifecycle.recordLandmarkInvestigation("isle-9:landmark", "blueglass-wake", 75), true);
assert.equal(lifecycle.recordLandmarkInvestigation("isle-9:landmark", "blueglass-wake", 76), false);
assert.equal(lifecycle.dirty, true);

const snapshot = lifecycle.snapshot();
assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.events.map((event) => event.key), [
  "region-entered:hushed-reach",
  "region-entered:blueglass-wake",
  "landmark-reached:isle-9:landmark",
  "landmark-investigated:isle-9:landmark",
]);
assert.equal(snapshot.events[1].regionId, "blueglass-wake");
assert.equal(snapshot.events[2].landmarkId, "isle-9:landmark");
assert.equal(snapshot.events[3].landmarkId, "isle-9:landmark");
assert.deepEqual(investigatedLandmarkIdsFromExploration(snapshot), ["isle-9:landmark"]);

const telemetry = lifecycle.telemetry();
assert.deepEqual(telemetry, {
  eventCount: 4,
  regionCount: 2,
  landmarkCount: 1,
  landmarkInvestigationCount: 1,
  routeCompletionCount: 0,
  dirty: true,
});

lifecycle.markFlushed();
assert.equal(lifecycle.dirty, false);
assert.equal(lifecycle.telemetry().dirty, false);

assert.equal(lifecycle.recordRouteCompletion("route:ring:0", 80), true);
assert.equal(lifecycle.recordRouteCompletion("route:ring:0", 90), false);
assert.equal(lifecycle.telemetry().routeCompletionCount, 1);

const malformed = createExplorationLifecycle({ events: [null, {}, { kind: "unknown", id: "x" }] });
assert.equal(malformed.snapshot().events.length, 0);
assert.equal(malformed.recordRegion({ id: "" }, 10), false);
assert.equal(malformed.recordLandmark(null, null, 10), false);
assert.equal(malformed.recordLandmarkInvestigation("", null, 10), false);
assert.deepEqual(investigatedLandmarkIdsFromExploration({ events: [null, { kind: "landmark-investigated", id: " " }] }), []);

console.log("exploration lifecycle tests passed");
