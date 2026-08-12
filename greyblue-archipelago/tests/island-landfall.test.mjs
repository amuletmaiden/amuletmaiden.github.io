import assert from "node:assert/strict";
import { deriveIslandLandfall } from "../src/core/island-landfall.js";

const touchdown = Object.freeze({ grounded: true, reason: "touchdown", requiresRecovery: false });
const ordinaryGround = Object.freeze({ grounded: true, reason: "grounded-contact", requiresRecovery: false });
const impact = Object.freeze({ grounded: false, reason: "terrain-impact", requiresRecovery: false });
const recovery = Object.freeze({ grounded: true, reason: "impact", requiresRecovery: true });
const islands = Object.freeze([
  Object.freeze({
    id: "island-a",
    regionId: "hushed-reach",
    name: "The Listening Bell",
    landingZones: Object.freeze([
      Object.freeze({ id: "island-a:landing-0", x: 100, y: 12, z: -40, radius: 60 }),
    ]),
  }),
  Object.freeze({
    id: "island-b",
    regionId: "blueglass-wake",
    name: "The Blueglass Lens",
    landingZones: Object.freeze([
      Object.freeze({ id: "island-b:landing-0", x: 122, y: 18, z: -40, radius: 60 }),
    ]),
  }),
]);

let result = deriveIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
  explorationEvents: [],
});
assert.deepEqual(result.state, { completed: true, newLandfall: true });
assert.deepEqual(result.event, { kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" });
assert.equal(result.islandName, "The Listening Bell");

for (const collision of [ordinaryGround, impact, recovery]) {
  result = deriveIslandLandfall({
    collision,
    position: { x: 101, z: -40 },
    islands,
    discoveredIslandIds: ["island-a"],
  });
  assert.deepEqual(result.state, { completed: false, newLandfall: false });
  assert.equal(result.event, null);
}

result = deriveIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: [],
});
assert.equal(result.event, null);

result = deriveIslandLandfall({
  collision: touchdown,
  position: { x: 180, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
});
assert.equal(result.event, null);

result = deriveIslandLandfall({
  collision: touchdown,
  position: { x: 118, z: -40 },
  islands,
  discoveredIslandIds: new Set(["island-a", "island-b"]),
});
assert.equal(result.event?.islandId, "island-b");

const history = Object.freeze([
  Object.freeze({ kind: "landmark-investigated", landmarkId: "island-a:encounter", regionId: "hushed-reach" }),
  Object.freeze({ kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" }),
]);
result = deriveIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
  explorationEvents: history,
});
assert.deepEqual(result.state, { completed: true, newLandfall: false });
assert.equal(result.event, null);
assert.equal(result.islandName, null);

for (const position of [null, {}, { x: Number.NaN, z: 0 }, { x: 0, z: Number.POSITIVE_INFINITY }]) {
  result = deriveIslandLandfall({ collision: touchdown, position, islands, discoveredIslandIds: ["island-a"] });
  assert.equal(result.event, null);
}

const malformed = Object.freeze([
  Object.freeze({ id: "bad", regionId: "hushed-reach", landingZones: Object.freeze([{ x: 0, z: 0, radius: -1 }]) }),
]);
result = deriveIslandLandfall({ collision: touchdown, position: { x: 0, z: 0 }, islands: malformed, discoveredIslandIds: ["bad"] });
assert.equal(result.event, null);

assert.equal(Object.keys(result.state).sort().join(","), "completed,newLandfall");
assert.deepEqual(touchdown, { grounded: true, reason: "touchdown", requiresRecovery: false });
assert.deepEqual(history[0], { kind: "landmark-investigated", landmarkId: "island-a:encounter", regionId: "hushed-reach" });
assert.equal(islands[0].landingZones[0].radius, 60);
