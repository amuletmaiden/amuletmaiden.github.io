import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLocalFamiliarity } from "../src/core/local-familiarity.js";

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: "a", x: 0, z: 0, regionId: "north", landmarkRecord: Object.freeze({ id: "bell" }) }),
    Object.freeze({ id: "b", x: 900, z: 0, regionId: "north", landmarkRecord: Object.freeze({ id: "spire" }) }),
    Object.freeze({ id: "hidden", x: 80, z: 40, regionId: "north", landmarkRecord: Object.freeze({ id: "hidden-mark" }) }),
    Object.freeze({ id: "far", x: 9000, z: 9000, regionId: "south", landmarkRecord: Object.freeze({ id: "far-mark" }) }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: "ab", fromIslandId: "a", toIslandId: "b", discovery: Object.freeze({ midpoint: Object.freeze({ x: 450, z: 0 }) }) }),
    Object.freeze({ id: "secret", fromIslandId: "a", toIslandId: "hidden", discovery: Object.freeze({ midpoint: Object.freeze({ x: 40, z: 20 }) }) }),
  ]),
});

function evaluate(overrides = {}) {
  return evaluateLocalFamiliarity({
    world,
    position: { x: 40, z: 20 },
    currentRegionId: "north",
    discoveredIslandIds: ["a", "b"],
    discoveredRouteIds: ["ab"],
    exploration: { events: [] },
    ...overrides,
  });
}

test("zero progress leaves authored mist unchanged", () => {
  const result = evaluate({ discoveredIslandIds: [], discoveredRouteIds: [], currentRegionId: null });
  assert.equal(result.familiarity, 0);
  assert.equal(result.densityMultiplier, 1);
  assert.equal(result.nearContrast, 0);
});

test("local truthful progress increases familiarity but stays bounded", () => {
  const base = evaluate();
  const progressed = evaluate({
    exploration: { events: [
      { kind: "region-entered", id: "north", regionId: "north" },
      { kind: "landmark-investigated", id: "bell", landmarkId: "bell", regionId: "north" },
      { kind: "route-completed", id: "ab", routeId: "ab" },
      { kind: "approach-mastered", id: "corridor-a", islandId: "a", corridorId: "corridor-a" },
    ] },
  });
  assert.ok(progressed.familiarity > base.familiarity);
  assert.ok(progressed.familiarity <= 1);
  assert.ok(progressed.densityMultiplier >= 0.84 && progressed.densityMultiplier <= 1);
  assert.ok(progressed.nearContrast >= 0 && progressed.nearContrast <= 0.1);
});

test("distant progress is locally irrelevant", () => {
  const localOnly = evaluate();
  const withFar = evaluate({
    exploration: { events: [
      { kind: "landmark-investigated", id: "far-mark", landmarkId: "far-mark", regionId: "south" },
      { kind: "approach-mastered", id: "far-corridor", islandId: "far", corridorId: "far-corridor" },
    ] },
  });
  assert.equal(withFar.familiarity, localOnly.familiarity);
});

test("hidden islands and routes cannot contribute", () => {
  const visible = evaluate();
  const attemptedLeak = evaluate({
    exploration: { events: [
      { kind: "landmark-investigated", id: "hidden-mark", landmarkId: "hidden-mark", regionId: "north" },
      { kind: "approach-mastered", id: "hidden-corridor", islandId: "hidden", corridorId: "hidden-corridor" },
      { kind: "route-completed", id: "secret", routeId: "secret" },
    ] },
  });
  assert.equal(attemptedLeak.familiarity, visible.familiarity);
});

test("completed routes require truthful discovery of route and both endpoints", () => {
  const event = { kind: "route-completed", id: "ab", routeId: "ab" };
  const hiddenEndpoint = evaluate({ discoveredIslandIds: ["a"], exploration: { events: [event] } });
  const unknownRoute = evaluate({ discoveredRouteIds: [], exploration: { events: [event] } });
  const truthful = evaluate({ exploration: { events: [event] } });
  assert.ok(truthful.familiarity > hiddenEndpoint.familiarity);
  assert.ok(truthful.familiarity > unknownRoute.familiarity);
});

test("duplicate and malformed events fail closed", () => {
  const single = evaluate({ exploration: { events: [{ kind: "region-entered", id: "north", regionId: "north" }] } });
  const noisy = evaluate({ exploration: { events: [
    null,
    { nope: true },
    { kind: "region-entered", id: "north", regionId: "north" },
    { kind: "region-entered", id: "north", regionId: "north" },
  ] } });
  assert.deepEqual(noisy, single);
});

test("ordering is stable and caller input is not mutated", () => {
  const events = [
    { kind: "route-completed", id: "ab", routeId: "ab" },
    { kind: "region-entered", id: "north", regionId: "north" },
    { kind: "landmark-investigated", id: "bell", landmarkId: "bell", regionId: "north" },
  ];
  const original = structuredClone(events);
  const first = evaluate({ exploration: { events } });
  const second = evaluate({ exploration: { events: [...events].reverse() } });
  assert.deepEqual(first, second);
  assert.deepEqual(events, original);
});

test("restored-save parity produces identical output", () => {
  const exploration = { version: 1, events: [
    { kind: "region-entered", id: "north", regionId: "north", occurredAt: 10 },
    { kind: "landmark-investigated", id: "bell", landmarkId: "bell", regionId: "north", occurredAt: 20 },
  ] };
  const live = evaluate({ exploration });
  const restored = evaluate({ exploration: JSON.parse(JSON.stringify(exploration)) });
  assert.deepEqual(restored, live);
});

test("radius and malformed coordinates remain bounded", () => {
  const result = evaluateLocalFamiliarity({
    world: { islands: [{ id: "a", x: Number.NaN, z: 0 }], routes: [] },
    position: { x: Number.POSITIVE_INFINITY, z: 0 },
    discoveredIslandIds: ["a"],
    radius: 999999,
  });
  assert.equal(result.familiarity, 0);
  assert.equal(result.radius, 3200);
  assert.equal(result.densityMultiplier, 1);
});
