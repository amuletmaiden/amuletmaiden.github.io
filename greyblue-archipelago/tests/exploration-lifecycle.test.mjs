import assert from "node:assert/strict";
import {
  createExplorationLifecycle,
  investigatedLandmarkIdsFromExploration,
  completedLandmarkFlightEncounterIdsFromExploration,
  masteredApproachIdsFromExploration,
} from "../src/core/exploration-lifecycle.js";

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
assert.equal(lifecycle.recordLandmarkFlightEncounter("isle-9:landmark", "isle-9", "blueglass-wake", "resonance", 77), true);
assert.equal(lifecycle.recordLandmarkFlightEncounter("isle-9:landmark", "isle-9", "blueglass-wake", "resonance", 78), false);
assert.equal(lifecycle.recordApproachMastery("isle-9", "isle-9:corridor:a", 79), true);
assert.equal(lifecycle.recordApproachMastery("isle-9", "isle-9:corridor:a", 80), false);
assert.equal(lifecycle.dirty, true);

const snapshot = lifecycle.snapshot();
assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.events.map((event) => event.key), [
  "region-entered:hushed-reach",
  "region-entered:blueglass-wake",
  "landmark-reached:isle-9:landmark",
  "landmark-investigated:isle-9:landmark",
  "landmark-flight-encounter:isle-9:landmark",
  "approach-mastered:isle-9:corridor:a",
]);
assert.equal(snapshot.events[4].encounterClass, "resonance");
assert.deepEqual(investigatedLandmarkIdsFromExploration(snapshot), ["isle-9:landmark"]);
assert.deepEqual(completedLandmarkFlightEncounterIdsFromExploration(snapshot), ["isle-9:landmark"]);
assert.deepEqual(masteredApproachIdsFromExploration(snapshot), ["isle-9:corridor:a"]);

const telemetry = lifecycle.telemetry();
assert.deepEqual(telemetry, {
  eventCount: 6,
  regionCount: 2,
  landmarkCount: 1,
  landmarkInvestigationCount: 1,
  landmarkFlightEncounterCount: 1,
  routeCompletionCount: 0,
  approachMasteryCount: 1,
  roostCount: 0,
  dirty: true,
});

lifecycle.markFlushed();
assert.equal(lifecycle.dirty, false);
assert.equal(lifecycle.recordRouteCompletion("route:ring:0", 81), true);
assert.equal(lifecycle.recordRouteCompletion("route:ring:0", 90), false);
assert.equal(lifecycle.telemetry().routeCompletionCount, 1);

const restored = createExplorationLifecycle(snapshot);
assert.deepEqual(completedLandmarkFlightEncounterIdsFromExploration(restored.snapshot()), ["isle-9:landmark"]);
assert.equal(restored.recordLandmarkFlightEncounter("isle-9:landmark", "isle-9", "blueglass-wake", "threshold", 500), false);

const malformed = createExplorationLifecycle({ events: [null, {}, { kind: "unknown", id: "x" }] });
assert.equal(malformed.snapshot().events.length, 0);
assert.equal(malformed.recordLandmarkFlightEncounter("", "isle", null, null, 10), false);
assert.equal(malformed.recordLandmarkFlightEncounter("landmark", "", null, null, 10), false);
assert.deepEqual(completedLandmarkFlightEncounterIdsFromExploration({ events: [null, { kind: "landmark-flight-encounter", id: " " }] }), []);

console.log("exploration lifecycle tests passed");
