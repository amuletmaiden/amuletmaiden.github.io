import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  saveGame,
  loadGame,
  safeRespawn,
  isValidWorldPosition,
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
    settings: { cameraDistance: 24 },
  }, storage);
  assert.deepEqual(saved.position, { x: 12, y: 144, z: -31 });
  assert.deepEqual(saved.discovered, ["isle-1", "isle-2"]);
  const loaded = loadGame(storage);
  assert.equal(loaded.seed, 77);
  assert.equal(loaded.recoveredCorruptPosition, false);
}

{
  const storage = new MemoryStorage();
  saveGame({
    seed: 1337,
    position: { x: -4.3e12, y: 2.5, z: 2.5e12 },
    discovered: ["isle-45"],
  }, storage);
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.position, { x: 0, y: 160, z: 220 });
  assert.equal(loaded.recoveredCorruptPosition, false, "saveGame never persists a corrupt position");
  assert.deepEqual(loaded.discovered, ["isle-45"]);
}

{
  const storage = new MemoryStorage();
  storage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
    version: 1,
    seed: 1337,
    position: { x: Number.MAX_VALUE, y: 2.5, z: -Number.MAX_VALUE },
    discovered: ["isle-45"],
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.position, { x: 0, y: 160, z: 220 });
  assert.equal(loaded.recoveredCorruptPosition, true);
  assert.deepEqual(loaded.discovered, ["isle-45"], "recovery preserves discovery state");
}

{
  assert.equal(isValidWorldPosition({ x: 0, y: 160, z: 0 }), true);
  assert.equal(isValidWorldPosition({ x: Infinity, y: 0, z: 0 }), false);
  assert.equal(isValidWorldPosition({ x: 24001, y: 0, z: 0 }), false);
  assert.equal(isValidWorldPosition({ x: 0, y: 8001, z: 0 }), false);
  const recovered = safeRespawn({ airborne: false }, { x: Infinity, y: 0, z: 0 });
  assert.deepEqual(recovered.position, { x: 0, y: 160, z: 220 });
  assert.equal(recovered.airborne, true);
}

console.log("save tests passed");
