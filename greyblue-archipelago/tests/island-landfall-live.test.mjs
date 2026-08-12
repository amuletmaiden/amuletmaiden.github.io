import assert from "node:assert/strict";
import { applyIslandLandfall } from "../src/core/island-landfall-live.js";

const touchdown = Object.freeze({ grounded: true, reason: "touchdown", requiresRecovery: false });
const islands = Object.freeze([
  Object.freeze({
    id: "island-a",
    regionId: "hushed-reach",
    name: "The Listening Bell",
    landingZones: Object.freeze([
      Object.freeze({ x: 100, y: 12, z: -40, radius: 60 }),
    ]),
  }),
]);

const exploration = { events: [] };
let persistCalls = 0;
const announcements = [];
let result = applyIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: new Set(["island-a"]),
  exploration,
  persist: () => { persistCalls += 1; },
  announce: (message) => announcements.push(message),
});

assert.deepEqual(result.state, { completed: true, newLandfall: true });
assert.deepEqual(result.event, { kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" });
assert.equal(result.message, "Landfall recorded: The Listening Bell.");
assert.deepEqual(exploration.events, [result.event]);
assert.equal(persistCalls, 1);
assert.deepEqual(announcements, ["Landfall recorded: The Listening Bell."]);

result = applyIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
  exploration,
  persist: () => { persistCalls += 1; },
  announce: (message) => announcements.push(message),
});
assert.deepEqual(result.state, { completed: true, newLandfall: false });
assert.equal(result.event, null);
assert.equal(result.message, null);
assert.equal(exploration.events.length, 1);
assert.equal(persistCalls, 1);
assert.equal(announcements.length, 1);

for (const collision of [
  { grounded: true, reason: "grounded-contact", requiresRecovery: false },
  { grounded: false, reason: "terrain-impact", requiresRecovery: false },
  { grounded: true, reason: "touchdown", requiresRecovery: true },
]) {
  const untouched = { events: [] };
  const neutral = applyIslandLandfall({
    collision,
    position: { x: 101, z: -40 },
    islands,
    discoveredIslandIds: ["island-a"],
    exploration: untouched,
    persist: () => { throw new Error("neutral result must not persist"); },
    announce: () => { throw new Error("neutral result must not announce"); },
  });
  assert.deepEqual(neutral.state, { completed: false, newLandfall: false });
  assert.deepEqual(untouched.events, []);
}

const missingOwner = applyIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
  exploration: null,
});
assert.deepEqual(missingOwner.state, { completed: true, newLandfall: true });
assert.equal(missingOwner.event, null);
assert.equal(missingOwner.message, null);

const unpersistable = { events: [] };
const missingPersist = applyIslandLandfall({
  collision: touchdown,
  position: { x: 101, z: -40 },
  islands,
  discoveredIslandIds: ["island-a"],
  exploration: unpersistable,
  announce: () => { throw new Error("unpersistable landfall must not announce"); },
});
assert.deepEqual(missingPersist.state, { completed: true, newLandfall: true });
assert.equal(missingPersist.event, null);
assert.equal(missingPersist.message, null);
assert.deepEqual(unpersistable.events, []);

assert.deepEqual(touchdown, { grounded: true, reason: "touchdown", requiresRecovery: false });
assert.equal(islands[0].landingZones[0].radius, 60);
