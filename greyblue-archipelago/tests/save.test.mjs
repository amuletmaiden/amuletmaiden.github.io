import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  saveGame,
  loadGame,
  safeRespawn,
  isValidWorldPosition,
  clearSave,
} = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

{
  const storage = new MemoryStorage();
  const saved = saveGame({
    seed: 77,
    position: { x: 12, y: 144, z: -31 },
    discovered: new Set(["isle-1", "isle-1", "isle-2"]),
    discoveredRoutes: new Set(["route:a", "route:a", " route:b ", ""]),
    guidance: { activeRouteId: " route:b ", progress: 0.42 },
    settings: { cameraDistance: 24 },
  }, storage);
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.position, { x: 12, y: 144, z: -31 });
  assert.deepEqual(saved.recoveryCheckpoint, { x: 12, y: 144, z: -31 });
  assert.deepEqual(saved.discovered, ["isle-1", "isle-2"]);
  assert.deepEqual(saved.discoveredRoutes, ["route:a", "route:b"]);
  assert.deepEqual(saved.guidance, { activeRouteId: "route:b", progress: 0.42 });
  const loaded = loadGame(storage);
  assert.equal(loaded.seed, 77);
  assert.equal(loaded.recoveredCorruptPosition, false);
  assert.equal(loaded.recoveredCorruptCheckpoint, false);
  assert.equal(loaded.migratedFromVersion, null);
  assert.deepEqual(loaded.recoveryCheckpoint, { x: 12, y: 144, z: -31 });
  assert.deepEqual(loaded.discoveredRoutes, ["route:a", "route:b"]);
  assert.deepEqual(loaded.guidance, { activeRouteId: "route:b", progress: 0.42 });
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 1,
    seed: 55,
    position: { x: 1, y: 160, z: 2 },
    discovered: ["isle-9"],
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.equal(loaded.version, 2, "v1 saves migrate in memory");
  assert.equal(loaded.migratedFromVersion, 1);
  assert.deepEqual(loaded.recoveryCheckpoint, { x: 1, y: 160, z: 2 }, "legacy saves use their valid position as the first recovery checkpoint");
  assert.deepEqual(loaded.discoveredRoutes, [], "v1 saves gain an empty route set");
  assert.deepEqual(loaded.discovered, ["isle-9"]);
  assert.equal(loaded.guidance, null, "v1 saves gain no stale active guidance");
}

{
  const storage = new MemoryStorage();
  saveGame({
    seed: 1337,
    position: { x: -4.3e12, y: 2.5, z: 2.5e12 },
    discovered: ["isle-45"],
    discoveredRoutes: ["route:ring:1"],
    guidance: { activeRouteId: "route:ring:1", progress: 7 },
  }, storage);
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.position, { x: 0, y: 160, z: 0 });
  assert.deepEqual(loaded.recoveryCheckpoint, { x: 0, y: 160, z: 0 });
  assert.equal(loaded.recoveredCorruptPosition, false, "saveGame never persists a corrupt position");
  assert.deepEqual(loaded.discovered, ["isle-45"]);
  assert.deepEqual(loaded.discoveredRoutes, ["route:ring:1"]);
  assert.deepEqual(loaded.guidance, { activeRouteId: "route:ring:1", progress: 1 }, "guidance progress is clamped at save time");
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 2,
    seed: 1337,
    position: { x: Number.MAX_VALUE, y: 2.5, z: -Number.MAX_VALUE },
    recoveryCheckpoint: { x: Infinity, y: 160, z: 0 },
    discovered: ["isle-45"],
    discoveredRoutes: ["route:ring:4", 7, null, "route:ring:4"],
    guidance: { activeRouteId: " route:ring:4 ", progress: -3 },
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.position, { x: 0, y: 160, z: 0 });
  assert.deepEqual(loaded.recoveryCheckpoint, { x: 0, y: 160, z: 0 }, "corrupt checkpoints fall back to the recovered position");
  assert.equal(loaded.recoveredCorruptPosition, true);
  assert.equal(loaded.recoveredCorruptCheckpoint, true);
  assert.deepEqual(loaded.discovered, ["isle-45"], "recovery preserves island discovery state");
  assert.deepEqual(loaded.discoveredRoutes, ["route:ring:4"], "recovery preserves normalized route discovery state");
  assert.deepEqual(loaded.guidance, { activeRouteId: "route:ring:4", progress: 0 });
}

{
  const storage = new MemoryStorage();
  for (const guidance of [
    null,
    [],
    {},
    { activeRouteId: "" },
    { activeRouteId: "   ", progress: 0.5 },
    { activeRouteId: 12, progress: 0.5 },
  ]) {
    storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
      version: 2,
      seed: 1337,
      position: { x: 0, y: 160, z: 0 },
      discovered: [],
      discoveredRoutes: [],
      guidance,
      settings: {},
    }));
    assert.equal(loadGame(storage).guidance, null, "malformed guidance cannot survive load normalization");
  }
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 2,
    seed: 1337,
    position: { x: 0, y: 160, z: 0 },
    discovered: [],
    discoveredRoutes: [],
    guidance: { activeRouteId: "route:a", progress: "not-a-number" },
    settings: {},
  }));
  assert.deepEqual(loadGame(storage).guidance, { activeRouteId: "route:a", progress: 0 });
}

{
  const storage = new MemoryStorage();
  clearSave(storage);
  saveGame({ seed: 1337, position: { x: 100, y: 200, z: 300 } }, storage);
  const second = saveGame({ seed: 1337, position: { x: 900, y: 240, z: -700 } }, storage);
  assert.deepEqual(second.recoveryCheckpoint, { x: 100, y: 200, z: 300 }, "the prior persisted position becomes the rolling recovery checkpoint");

  const duplicate = saveGame({ seed: 1337, position: { x: 900, y: 240, z: -700 } }, storage);
  assert.deepEqual(duplicate.recoveryCheckpoint, { x: 100, y: 200, z: 300 }, "a duplicate same-position save cannot collapse the one-save-behind recovery checkpoint");

  const recovered = safeRespawn({
    airborne: false,
    velocity: { x: 12, y: -4, z: 2 },
    landingRequested: true,
  }, { x: 0, y: 160, z: 0 });
  assert.deepEqual(recovered.position, { x: 100, y: 200, z: 300 }, "recovery returns to the last stable persisted position instead of the global origin");
  assert.deepEqual(recovered.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(recovered.airborne, true);
  assert.equal(recovered.landingRequested, false);

  const afterRecoverySave = saveGame({ seed: 1337, position: recovered.position }, storage);
  assert.deepEqual(afterRecoverySave.recoveryCheckpoint, { x: 100, y: 200, z: 300 }, "the immediate recovery save cannot replace the checkpoint with the failed pre-recovery position");
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 2,
    seed: 1337,
    position: { x: 700, y: 250, z: 800 },
    recoveryCheckpoint: { x: 650, y: 220, z: 760 },
    discovered: [],
    discoveredRoutes: [],
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.recoveryCheckpoint, { x: 650, y: 220, z: 760 });
  const recovered = safeRespawn({ airborne: false });
  assert.deepEqual(recovered.position, { x: 650, y: 220, z: 760 }, "durable checkpoints survive reloads");
}

{
  assert.equal(isValidWorldPosition({ x: 0, y: 160, z: 0 }), true);
  assert.equal(isValidWorldPosition({ x: Infinity, y: 0, z: 0 }), false);
  assert.equal(isValidWorldPosition({ x: 24001, y: 0, z: 0 }), false);
  assert.equal(isValidWorldPosition({ x: 0, y: 8001, z: 0 }), false);
  clearSave(new MemoryStorage());
  const recovered = safeRespawn({ airborne: false, discoveredRoutes: new Set(["route:a"]), guidance: { activeRouteId: "route:a", progress: 0.5 } }, { x: Infinity, y: 0, z: 0 });
  assert.deepEqual(recovered.position, { x: 0, y: 160, z: 0 });
  assert.equal(recovered.airborne, true);
  assert.deepEqual([...recovered.discoveredRoutes], ["route:a"]);
  assert.deepEqual(recovered.guidance, { activeRouteId: "route:a", progress: 0.5 });
}

console.log("save tests passed");
