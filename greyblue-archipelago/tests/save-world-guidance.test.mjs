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
    contractVersion: 3,
    valid: true,
    issues: [],
    diagnostics: { issueCount: 0, highestSeverity: null, severities: [], codes: [], invariants: [] },
  },
  routeIds: new Set(["route:a", "route:b"]),
  discoveredRoutes: new Set(["route:a"]),
};

assert.deepEqual(
  normalizeGuidanceForWorld({ activeRouteId: " route:a ", progress: 4 }, validContext),
  { activeRouteId: "route:a", progress: 1 },
);
assert.equal(normalizeGuidanceForWorld({ activeRouteId: "route:b", progress: 0.2 }, validContext), null);
assert.equal(normalizeGuidanceForWorld({ activeRouteId: "route:missing", progress: 0.2 }, validContext), null);
assert.deepEqual(normalizeGuidanceForWorld({ activeRouteId: "route:a", progress: -2 }), { activeRouteId: "route:a", progress: 0 });

const invalidValidation = {
  contractVersion: 3,
  valid: false,
  issues: [
    { severity: "critical", code: "route-endpoint", invariant: "route-destination-known" },
    { severity: "error", code: "route-navigation", invariant: "route-distance-finite" },
  ],
  diagnostics: {
    issueCount: 2,
    highestSeverity: "critical",
    severities: ["critical", "error"],
    codes: ["route-endpoint", "route-navigation"],
    invariants: ["route-destination-known", "route-distance-finite"],
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
    contractVersion: 3,
    issueCount: 2,
    highestSeverity: "critical",
    primaryInvariant: "route-destination-known",
    severities: ["critical", "error"],
    codes: ["route-endpoint", "route-navigation"],
    invariants: ["route-destination-known", "route-distance-finite"],
  },
});

const storage = new MemoryStorage();
const saved = saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discovered: ["island:a"],
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, storage, validContext);
assert.deepEqual(saved.guidance, { activeRouteId: "route:a", progress: 0.45 });
assert.equal(saved.guidanceRecovery, null);
assert.equal(JSON.parse(storage.getItem("greyblue-archipelago-save-v1")).guidanceRecovery, undefined, "transient recovery metadata is never persisted");

const invalidStorage = new MemoryStorage();
const invalidSaved = saveGame({
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:a", progress: 0.45 },
}, invalidStorage, { ...validContext, validation: invalidValidation });
assert.equal(invalidSaved.guidance, null);
assert.equal(invalidSaved.guidanceRecovery.reason, "world-validation-failed");
const persistedInvalid = JSON.parse(invalidStorage.getItem("greyblue-archipelago-save-v1"));
assert.equal(persistedInvalid.guidanceRecovery, undefined);
assert.deepEqual(persistedInvalid.discoveredRoutes, ["route:a"]);
const laterValidLoad = loadGame(invalidStorage, validContext);
assert.equal(laterValidLoad.guidance, null);
assert.equal(laterValidLoad.guidanceRecovery, null, "stale transient recovery is not resurrected from storage");
assert.deepEqual(laterValidLoad.discoveredRoutes, ["route:a"]);

const staleStorage = new MemoryStorage();
staleStorage.setItem("greyblue-archipelago-save-v1", JSON.stringify({
  version: 2,
  seed: 7,
  position: { x: 1, y: 160, z: 2 },
  discoveredRoutes: ["route:a"],
  guidance: { activeRouteId: "route:removed", progress: 0.8 },
  guidanceRecovery: { reason: "world-validation-failed" },
  settings: {},
}));
const loaded = loadGame(staleStorage, validContext);
assert.equal(loaded.guidance, null);
assert.equal(loaded.guidanceRecovery.reason, "unknown-route", "current deterministic reason replaces stale stored metadata");
assert.equal(loaded.guidanceRecovery.activeRouteId, "route:removed");
assert.deepEqual(loaded.discoveredRoutes, ["route:a"]);

console.log("save world guidance tests passed");
