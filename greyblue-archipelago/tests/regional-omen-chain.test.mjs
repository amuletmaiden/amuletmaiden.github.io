import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegionalOmenChain } from "../src/core/regional-omen-chain.js";

function world() {
  return {
    regions: [{ id: "blueglass-wake" }, { id: "mothwater" }],
    islands: [
      { regionId: "blueglass-wake", landmarkRecord: { id: "lens", encounter: { class: "instrument" } } },
      { regionId: "blueglass-wake", landmarkRecord: { id: "reef", encounter: { class: "threshold" } } },
      { regionId: "blueglass-wake", landmarkRecord: { id: "engine", encounter: { class: "instrument" } } },
      { regionId: "mothwater", landmarkRecord: { id: "garden", encounter: { class: "relic" } } },
    ],
  };
}

function exploration(...events) {
  return { events };
}

const investigated = (landmarkId) => ({ kind: "landmark-investigated", landmarkId });

test("requires two distinct investigated authored landmarks in the current region", () => {
  const dormant = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("lens")),
  });
  assert.equal(dormant.active, false);

  const active = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("lens"), investigated("reef")),
  });
  assert.equal(active.active, true);
  assert.equal(active.tone.id, "confluence");
  assert.deepEqual(active.landmarkIds, ["lens", "reef"]);
});

test("duplicate investigations cannot satisfy the threshold", () => {
  const result = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("lens"), investigated("lens"), investigated("lens")),
  });
  assert.equal(result.active, false);
});

test("unknown and cross-region investigations fail closed", () => {
  const result = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("lens"), investigated("garden"), investigated("unknown")),
  });
  assert.equal(result.active, false);
});

test("same-class chains receive a stable authored tone", () => {
  const result = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("lens"), investigated("engine")),
  });
  assert.equal(result.active, true);
  assert.equal(result.tone.id, "measured-weather");
  assert.equal(result.tone.soundHook, "omen-measured-weather");
});

test("ordering and restored state are deterministic", () => {
  const forward = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: exploration(investigated("reef"), investigated("lens")),
  });
  const restored = JSON.parse(JSON.stringify(exploration(investigated("lens"), investigated("reef"))));
  const reverse = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: restored,
  });
  assert.deepEqual(forward, reverse);
});

test("malformed input fails closed and caller input is not mutated", () => {
  const events = [null, {}, { kind: "landmark-investigated", landmarkId: "lens" }];
  const before = JSON.stringify(events);
  const result = evaluateRegionalOmenChain({
    world: world(),
    currentRegionId: "blueglass-wake",
    exploration: { events },
  });
  assert.equal(result.active, false);
  assert.equal(JSON.stringify(events), before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.landmarkIds));
});

test("public landmark telemetry is bounded", () => {
  const islands = Array.from({ length: 20 }, (_, index) => ({
    regionId: "blueglass-wake",
    landmarkRecord: { id: `landmark-${String(index).padStart(2, "0")}`, encounter: { class: "threshold" } },
  }));
  const result = evaluateRegionalOmenChain({
    world: { regions: [{ id: "blueglass-wake" }], islands },
    currentRegionId: "blueglass-wake",
    exploration: exploration(...islands.map((island) => investigated(island.landmarkRecord.id))),
  });
  assert.equal(result.active, true);
  assert.equal(result.landmarkIds.length, 8);
});
