import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { saveGame, loadGame } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const storage = new MemoryStorage();

saveGame({
  seed: 1337,
  position: { x: 12, y: 180, z: 40 },
  discovered: ["isle-4"],
  discoveredRoutes: [],
  exploration: {
    version: 1,
    events: [
      { kind: "region-entered", id: "hushed-reach", regionId: "hushed-reach", occurredAt: 10 },
      { kind: "landmark-reached", id: "isle-4:landmark", landmarkId: "isle-4:landmark", regionId: "hushed-reach", occurredAt: 20 },
    ],
  },
  settings: { cameraDistance: 24 },
}, storage);

saveGame({
  seed: 1337,
  position: { x: 90, y: 220, z: 120 },
  discovered: ["isle-4", "isle-5"],
  discoveredRoutes: ["route:hushed-reach:0"],
  settings: { cameraDistance: 30 },
}, storage);

const loaded = loadGame(storage);
assert.deepEqual(loaded.position, { x: 90, y: 220, z: 120 });
assert.deepEqual(loaded.discovered, ["isle-4", "isle-5"]);
assert.deepEqual(loaded.discoveredRoutes, ["route:hushed-reach:0"]);
assert.equal(loaded.exploration.events.length, 2);
assert.equal(loaded.exploration.events[0].key, "region-entered:hushed-reach");
assert.equal(loaded.exploration.events[1].key, "landmark-reached:isle-4:landmark");
assert.equal(loaded.explorationRecovery.restoredEventCount, 2);

console.log("exploration save continuity tests passed");
