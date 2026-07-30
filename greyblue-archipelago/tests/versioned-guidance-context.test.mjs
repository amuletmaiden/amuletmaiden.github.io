import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/core/versioned-guidance-context.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { createVersionedGuidanceContext } = await import(moduleUrl);

const current = createVersionedGuidanceContext({
  validation: { valid: true, issues: [] },
  diagnostics: {
    valid: true,
    compatibility: { version: 3, status: "current", supported: true, reason: null },
    issueCount: 0,
    codes: [],
    invariants: [],
    severities: [],
    highestSeverity: null,
  },
  routeIds: new Set(["route:b", "route:a"]),
  discoveredRoutes: ["route:a", "route:a"],
});
assert.equal(current.validation.valid, true);
assert.deepEqual(current.routeIds, ["route:a", "route:b"]);
assert.deepEqual(current.discoveredRoutes, ["route:a"]);
assert.equal(current.validationCompatibility.status, "current");

const legacy = createVersionedGuidanceContext({
  validation: { valid: true, issues: [] },
  diagnostics: {
    valid: true,
    compatibility: { version: 2, status: "legacy-supported", supported: true, reason: "legacy-diagnostics-shape" },
    issueCount: 0,
    codes: [],
    invariants: [],
    severities: ["critical"],
    highestSeverity: "critical",
  },
});
assert.equal(legacy.validation.valid, true);
assert.deepEqual(legacy.validation.diagnostics.severities, [], "v2 cannot leak v3 severity semantics");
assert.equal(legacy.validation.diagnostics.highestSeverity, null);

for (const compatibility of [
  { version: 9, status: "future", supported: false, reason: "unsupported-future-version" },
  { version: 1, status: "legacy-unsupported", supported: false, reason: "unsupported-legacy-version" },
  { version: null, status: "malformed", supported: false, reason: "missing-contract-version" },
]) {
  const context = createVersionedGuidanceContext({
    validation: { valid: true, issues: [] },
    diagnostics: { valid: true, compatibility },
    discoveredRoutes: ["route:a"],
  });
  assert.equal(context.validation.valid, false);
  assert.equal(context.validation.issues[0].invariant, "validator-contract-supported");
  assert.deepEqual(context.discoveredRoutes, ["route:a"], "unsupported diagnostics cannot corrupt discovery state");
  assert.equal(context.validationCompatibility.reason, compatibility.reason);
}

assert.doesNotThrow(() => JSON.stringify([current, legacy]));
console.log("versioned guidance context tests passed");