import assert from "node:assert/strict";
import { createExplorationLifecycle, investigatedLandmarkIdsFromExploration } from "../src/core/exploration-lifecycle.js";
import { createLandmarkEncounterState, selectLandmarkEncounter } from "../src/core/landmark-encounter-model.js";
import { loadGame, saveGame } from "../src/core/save.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const storage = memoryStorage();
const lifecycle = createExplorationLifecycle();
assert.equal(lifecycle.recordLandmark({ id: "isle-7:bell" }, "blueglass-wake", 100), true);
assert.equal(lifecycle.recordLandmarkInvestigation("isle-7:bell", "blueglass-wake", 120), true);

saveGame({
  seed: 1337,
  position: { x: 12, y: 140, z: -8 },
  discovered: ["isle-7"],
  discoveredRoutes: [],
  guidance: null,
  exploration: lifecycle.snapshot(),
  settings: { reducedMotion: true },
}, storage);

const restored = loadGame(storage);
assert.ok(restored);
assert.equal(restored.exploration.events.filter((event) => event.kind === "landmark-investigated").length, 1);
assert.deepEqual(investigatedLandmarkIdsFromExploration(restored.exploration), ["isle-7:bell"]);
assert.deepEqual(restored.discovered, ["isle-7"]);
assert.equal(restored.settings.reducedMotion, true);

const encounterState = createLandmarkEncounterState({
  visitedIds: investigatedLandmarkIdsFromExploration(restored.exploration),
});
const world = {
  islands: [{
    id: "isle-7",
    x: 0,
    z: 0,
    landmarkRecord: {
      id: "isle-7:bell",
      title: "The Bell Below",
      encounter: {
        class: "echo",
        triggerRadius: 180,
        minimumAltitude: 20,
        revealText: "Something beneath the mist answers once.",
      },
    },
  }],
};
const selection = selectLandmarkEncounter({
  world,
  position: { x: 20, y: 80, z: 10 },
  altitude: 80,
}, encounterState);
assert.equal(selection.view.visible, true);
assert.equal(selection.view.visited, true);
assert.equal(selection.view.available, false);
assert.equal(selection.view.prompt, "Encounter remembered");

const restoredLifecycle = createExplorationLifecycle(restored.exploration);
assert.equal(restoredLifecycle.recordLandmarkInvestigation("isle-7:bell", "blueglass-wake", 500), false);
assert.equal(restoredLifecycle.telemetry().landmarkInvestigationCount, 1);

console.log("landmark investigation continuity tests passed");
