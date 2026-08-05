import assert from "node:assert/strict";
import test from "node:test";
import { planDestinationGuidance } from "../src/interface/destination-guidance.js";

const landmarks = [
  { id: "far", name: "Far Spire", position: { x: 0, y: 0, z: 1400 }, routeOrder: 2 },
  { id: "near", name: "Near Stone", position: { x: 100, y: 0, z: 0 }, routeOrder: 1, soundHookId: "stone-arrival" },
];

test("selects the earliest reachable uncompleted landmark deterministically", () => {
  const result = planDestinationGuidance({ position: { x: 0, y: 0, z: 0 }, landmarks });
  assert.equal(result.destination.id, "near");
  assert.equal(result.destination.distanceBand, "arrival");
  assert.equal(result.destination.bearingDegrees, 90);
});

test("skips completed landmarks", () => {
  const result = planDestinationGuidance({ landmarks, completedLandmarkIds: ["near"] });
  assert.equal(result.destination.id, "far");
});

test("deduplicates repeated live-region announcements", () => {
  const first = planDestinationGuidance({ landmarks });
  const second = planDestinationGuidance({ landmarks, previousAnnouncementId: first.announcement.id });
  assert.ok(first.announcement);
  assert.equal(second.announcement, null);
});

test("preserves meaning under reduced motion", () => {
  const result = planDestinationGuidance({ landmarks, reducedMotion: true });
  assert.equal(result.destination.motion, "none");
  assert.equal(result.destination.phase, "arrived");
});

test("handles malformed metadata and empty worlds", () => {
  const result = planDestinationGuidance({ landmarks: [null, {}, { id: "broken" }] });
  assert.equal(result.destination, null);
  assert.equal(result.telemetry.reason, "no-destination");
});

test("does not mutate caller-owned state and remains JSON-safe", () => {
  const input = { position: { x: 1, y: 2, z: 3 }, landmarks: structuredClone(landmarks), completedLandmarkIds: [] };
  const before = structuredClone(input);
  const result = planDestinationGuidance(input);
  assert.deepEqual(input, before);
  assert.doesNotThrow(() => JSON.stringify(result));
});
