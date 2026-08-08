import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegionalOmenChain } from "../src/core/regional-omen-chain.js";

function world() {
  return {
    regions: [{ id: "blueglass-wake" }, { id: "mothwater" }],
    islands: [
      { id: "lens-isle", regionId: "blueglass-wake", landmarkRecord: { id: "lens", encounter: { class: "instrument" } } },
      { id: "reef-isle", regionId: "blueglass-wake", landmarkRecord: { id: "reef", encounter: { class: "threshold" } } },
      { id: "engine-isle", regionId: "blueglass-wake", landmarkRecord: { id: "engine", encounter: { class: "instrument" } } },
      { id: "garden-isle", regionId: "mothwater", landmarkRecord: { id: "garden", encounter: { class: "relic" } } },
    ],
  };
}
const discovered = ["lens-isle", "reef-isle", "engine-isle", "garden-isle"];
const exploration = (...events) => ({ events });
const investigated = (landmarkId) => ({ kind: "landmark-investigated", landmarkId });
const evaluate = (events, extra = {}) => evaluateRegionalOmenChain({ world: world(), currentRegionId: "blueglass-wake", discoveredIslandIds: discovered, exploration: exploration(...events), ...extra });

test("requires two distinct investigated authored landmarks in the current region", () => {
  assert.equal(evaluate([investigated("lens")]).active, false);
  const active = evaluate([investigated("lens"), investigated("reef")]);
  assert.equal(active.active, true); assert.equal(active.tone.id, "confluence"); assert.deepEqual(active.landmarkIds, ["lens", "reef"]);
});

test("duplicate investigations cannot satisfy the threshold", () => {
  assert.equal(evaluate([investigated("lens"), investigated("lens"), investigated("lens")]).active, false);
});

test("unknown and cross-region investigations fail closed", () => {
  assert.equal(evaluate([investigated("lens"), investigated("garden"), investigated("unknown")]).active, false);
});

test("undiscovered host islands cannot contribute omen evidence", () => {
  const result = evaluate([investigated("lens"), investigated("reef")], { discoveredIslandIds: ["lens-isle"] });
  assert.equal(result.active, false);
});

test("same-class chains receive a stable authored tone", () => {
  const result = evaluate([investigated("lens"), investigated("engine")]);
  assert.equal(result.active, true); assert.equal(result.tone.id, "measured-weather"); assert.equal(result.tone.soundHook, "omen-measured-weather");
});

test("ordering and restored state are deterministic", () => {
  const forward = evaluate([investigated("reef"), investigated("lens")]);
  const restored = JSON.parse(JSON.stringify(exploration(investigated("lens"), investigated("reef"))));
  const reverse = evaluateRegionalOmenChain({ world: world(), currentRegionId: "blueglass-wake", discoveredIslandIds: discovered, exploration: restored });
  assert.deepEqual(forward, reverse);
});

test("malformed input fails closed and caller input is not mutated", () => {
  const events = [null, {}, { kind: "landmark-investigated", landmarkId: "lens" }];
  const before = JSON.stringify(events);
  const result = evaluateRegionalOmenChain({ world: world(), currentRegionId: "blueglass-wake", discoveredIslandIds: discovered, exploration: { events } });
  assert.equal(result.active, false); assert.equal(JSON.stringify(events), before); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.landmarkIds));
});

test("public landmark telemetry is bounded", () => {
  const islands = Array.from({ length: 20 }, (_, index) => ({ id: `island-${index}`, regionId: "blueglass-wake", landmarkRecord: { id: `landmark-${String(index).padStart(2, "0")}`, encounter: { class: "threshold" } } }));
  const result = evaluateRegionalOmenChain({ world: { regions: [{ id: "blueglass-wake" }], islands }, currentRegionId: "blueglass-wake", discoveredIslandIds: islands.map((island) => island.id), exploration: exploration(...islands.map((island) => investigated(island.landmarkRecord.id))) });
  assert.equal(result.active, true); assert.equal(result.landmarkIds.length, 8);
});