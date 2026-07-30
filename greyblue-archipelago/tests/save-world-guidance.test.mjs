import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/save.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { loadGame, normalizeGuidanceForWorld, recoverGuidanceForWorld, saveGame } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const validContext = {
  validation: {
    contractVersion: 2,
    valid: true,
    issues: [],
    diagnostics: { issueCount: 0, codes: [], invariants: [] },
  },
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

const invalidValidation = {
  contractVersion: 2,
  valid: false,
  issues: [
    { code: "route-endpoint", invariant: "route-destination-known" },
    { code: "route-navigation", invariant: "route-distance-finite" },
  ],
  diagnostics: {
    issueCount: 2,
    codes: ["route-navigation", "route-endpoint", "route-endpoint"],
    invariants: ["route-distance-finite", "route-destination-known"],
  },
};
const failedRecovery = recoverGuidanceForWorld(
  { activeRouteId: "route:a", progress: 0.4 },
  { ...validContext, validation: invalidValidation },
);
assert.equal(failedRecovery.guidance, null);
assert.deepEqual(failedRecovery.recovery, {
  reason: "world-validation-failed",
  activeRouteId: "route:a",
  validation: {
    contractVersion: 2,
    issueCount: 2,
    codes: ["route-endpoint", "route-navigation"],
    invariants: ["route-destination-known", "route-distance-finite"],
  },
});
assert.deepEqual(
  recoverGuidanceForWorld({ activeRouteId: "route:missing", progress: 0.2 }, validContext).recovery.reason,
  "unknown-route",
);
assert.deepEqual(
  recoverGuidanceForWorld({ activeRouteId: "route:b", progress: 0.2 }, validContext).recovery.reason,
  "undiscovered-route",
);
assert.equal(recoverGuidanceForWorld({ activeRouteId: "route:a", progress: 0.2 }).recovery, null, "legacy callers do not gain recovery metadata");

const storage = new MemoryStorage();
const saved = saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discovered: ["island:a"],
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, storage, validContext);
assert.deepEqual(saved.guidance, { activeRouteId: "route:a", progress: 0.45 });
assert.equal(saved.guidanceRecovery, undefined);
assert.deepEqual(loadGame(storage, validContext).guidance, saved.guidance);
assert.equal(loadGame(storage, validContext).guidanceRecovery, null);

const invalidStorage = new MemoryStorage();
const invalidSaved = saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, invalidStorage, { ...validContext, validation: invalidValidation });
assert.equal(invalidSaved.guidance, null);
assert.equal(invalidSaved.guidanceRecovery.reason, "world-validation-failed");
const recoveredInvalid = loadGame(invalidStorage, validContext);
assert.equal(recoveredInvalid.guidance, null, "invalid world guidance is never persisted");
assert.equal(recoveredInvalid.guidanceRecovery.reason, "world-validation-failed", "stored recovery reason survives later valid loads");
assert.deepEqual(recoveredInvalid.discoveredRoutes, ["route:a"], "validation recovery preserves route discoveries");

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
assert.equal(loaded.guidanceRecovery.reason, "unknown-route");
assert.equal(loaded.guidanceRecovery.activeRouteId, "route:removed");
assert.deepEqual(loaded.discoveredRoutes, ["route:a"], "failing guidance closed preserves valid discovery progress");

console.log("save world guidance tests passed");
