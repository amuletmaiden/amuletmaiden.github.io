import assert from "node:assert/strict";
import { saveGame, loadGame } from "../src/core/save.js";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

{
  const storage = new MemoryStorage();
  saveGame({
    seed: 1337,
    position: { x: 100, y: 12, z: -40 },
    discovered: ["island-a"],
    discoveredRoutes: [],
    exploration: {
      events: [
        { kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" },
      ],
    },
  }, storage);

  const loaded = loadGame(storage);
  assert.equal(loaded.exploration.events.length, 1);
  assert.equal(loaded.exploration.events[0].kind, "island-landed");
  assert.equal(loaded.exploration.events[0].islandId, "island-a");
  assert.equal(loaded.exploration.events[0].regionId, "hushed-reach");
  assert.equal(loaded.exploration.events[0].id, "island-a");
}

{
  const storage = new MemoryStorage();
  const saved = saveGame({
    seed: 1337,
    position: { x: 100, y: 12, z: -40 },
    discovered: ["island-a"],
    discoveredRoutes: [],
    exploration: {
      events: [
        { kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" },
        { kind: "island-landed", islandId: "island-a", regionId: "hushed-reach" },
        { kind: "island-landed", regionId: "hushed-reach" },
      ],
    },
  }, storage);

  assert.equal(saved.exploration.events.length, 1, "duplicate island landfalls normalize idempotently and malformed landfalls are discarded");
  assert.deepEqual(saved.exploration.events[0], {
    key: "island-landed:island-a",
    kind: "island-landed",
    id: "island-a",
    occurredAt: 0,
    regionId: "hushed-reach",
    islandId: "island-a",
  });
}
