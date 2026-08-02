import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { saveGame, loadGame, safeRespawn } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

{
  const storage = new MemoryStorage();
  const state = {
    seed: 42,
    position: { x: 12, y: 180, z: -9 },
    discovered: ["isle:a"],
    discoveredRoutes: ["route:a"],
    guidance: { activeRouteId: "route:a", progress: 0.4 },
    settings: { cameraDistance: 28 },
    exploration: {
      version: 1,
      events: [
        { kind: "landmark-reached", id: "isle:a", landmarkId: "landmark:a", occurredAt: 20 },
        { kind: "region-entered", id: "region:a", regionId: "region:a", occurredAt: 10 },
        { kind: "landmark-reached", id: "isle:a", landmarkId: "landmark:a", occurredAt: 30 },
      ],
      keys: new Set(["transient:index"]),
      toast: "not durable",
    },
  };

  const saved = saveGame(state, storage);
  assert.deepEqual(saved.exploration, {
    version: 1,
    events: [
      {
        key: "region-entered:region:a",
        kind: "region-entered",
        id: "region:a",
        occurredAt: 10,
        regionId: "region:a",
      },
      {
        key: "landmark-reached:isle:a",
        kind: "landmark-reached",
        id: "isle:a",
        occurredAt: 20,
        landmarkId: "landmark:a",
      },
    ],
  });
  assert.equal(Object.hasOwn(saved.exploration, "keys"), false);
  assert.equal(Object.hasOwn(saved.exploration, "toast"), false);

  const loaded = loadGame(storage);
  assert.deepEqual(loaded.exploration, saved.exploration);
  assert.deepEqual(loaded.discovered, ["isle:a"]);
  assert.deepEqual(loaded.discoveredRoutes, ["route:a"]);
  assert.deepEqual(loaded.guidance, { activeRouteId: "route:a", progress: 0.4 });
  assert.deepEqual(loaded.settings, { cameraDistance: 28 });
  assert.deepEqual(loaded.explorationRecovery, {
    hadExplorationField: true,
    restoredEventCount: 2,
    recoveredEmpty: false,
  });
  assert.equal(state.exploration.events.length, 3, "saving must not mutate caller exploration data");
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 2,
    seed: 9,
    position: { x: Number.MAX_VALUE, y: 0, z: Number.MAX_VALUE },
    discovered: ["legacy:isle"],
    discoveredRoutes: ["legacy:route"],
    guidance: { activeRouteId: "legacy:route", progress: 0.7 },
    settings: { cameraDistance: 31 },
    exploration: { events: "malformed" },
  }));

  const loaded = loadGame(storage);
  assert.deepEqual(loaded.position, { x: 0, y: 160, z: 0 });
  assert.deepEqual(loaded.discovered, ["legacy:isle"]);
  assert.deepEqual(loaded.discoveredRoutes, ["legacy:route"]);
  assert.deepEqual(loaded.guidance, { activeRouteId: "legacy:route", progress: 0.7 });
  assert.deepEqual(loaded.settings, { cameraDistance: 31 });
  assert.deepEqual(loaded.exploration, { version: 1, events: [] });
  assert.equal(loaded.explorationRecovery.recoveredEmpty, true);

  const recovered = safeRespawn({
    ...loaded,
    exploration: loaded.exploration,
    velocity: { x: 4, y: -2, z: 1 },
    airborne: false,
  });
  assert.deepEqual(recovered.exploration, loaded.exploration, "safe recovery preserves durable progress");
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 1,
    seed: 3,
    position: { x: 0, y: 160, z: 0 },
    discovered: ["legacy-only"],
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.exploration, { version: 1, events: [] });
  assert.deepEqual(loaded.explorationRecovery, {
    hadExplorationField: false,
    restoredEventCount: 0,
    recoveredEmpty: true,
  });
  assert.deepEqual(loaded.discovered, ["legacy-only"], "legacy discoveries are preserved, not reinterpreted as events");
}

console.log("exploration save integration tests passed");
