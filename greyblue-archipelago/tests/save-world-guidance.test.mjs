import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { loadGame, normalizeGuidanceForWorld, saveGame } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const validContext = {
  validation: { valid: true, issues: [] },
  routeIds: new Set(["route:a", "route:b"]),
  discoveredRoutes: new Set(["route:a"]),
};

assert.deepEqual(
  normalizeGuidanceForWorld({ activeRouteId: " route:a ", progress: 4 }, validContext),
  { activeRouteId: "route:a", progress: 1 },
);
assert.equal(normalizeGuidanceForWorld({ activeRouteId: "route:b", progress: 0.2 }, validContext), null, "undiscovered route cannot resume");
assert.equal(normalizeGuidanceForWorld({ activeRouteId: "route:missing", progress: 0.2 }, validContext), null, "unknown route cannot resume");
assert.equal(normalizeGuidanceForWorld({ activeRouteId: "route:a", progress: 0.2 }, { ...validContext, validation: { valid: false, issues: [{ code: "route-endpoint" }] } }), null, "invalid world fails closed");
assert.deepEqual(normalizeGuidanceForWorld({ activeRouteId: "route:a", progress: -2 }), { activeRouteId: "route:a", progress: 0 }, "legacy callers remain compatible without a world context");

const storage = new MemoryStorage();
const saved = saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discovered: ["island:a"],
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, storage, validContext);
assert.deepEqual(saved.guidance, { activeRouteId: "route:a", progress: 0.45 });
assert.deepEqual(loadGame(storage, validContext).guidance, saved.guidance);

const invalidStorage = new MemoryStorage();
saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, invalidStorage, { ...validContext, validation: { valid: false } });
assert.equal(loadGame(invalidStorage, validContext).guidance, null, "invalid world guidance is never persisted");

const staleStorage = new MemoryStorage();
staleStorage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
  version: 2,
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:removed", progress: 0.8 },
  settings: {},
}));
const loaded = loadGame(staleStorage, validContext);
assert.equal(loaded.guidance, null);
assert.deepEqual(loaded.discoveredRoutes, ["route:a"], "failing guidance closed preserves valid discovery progress");

console.log("save world guidance tests passed");
