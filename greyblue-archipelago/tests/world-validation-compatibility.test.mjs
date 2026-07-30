import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/world/validation-compatibility.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { classifyWorldContract, normalizeVersionedDiagnostics } = await import(moduleUrl);

assert.deepEqual(classifyWorldContract({ contractVersion: 3 }), {
  currentVersion: 3,
  minimumSupportedVersion: 2,
  version: 3,
  status: "current",
  supported: true,
  reason: null,
});
assert.equal(classifyWorldContract({ contractVersion: 2 }).status, "legacy-supported");
assert.equal(classifyWorldContract({ contractVersion: 1 }).supported, false);
assert.equal(classifyWorldContract({ contractVersion: 4 }).reason, "unsupported-future-version");
assert.equal(classifyWorldContract({}).reason, "missing-contract-version");

const legacy = normalizeVersionedDiagnostics({
  contractVersion: 2,
  valid: false,
  issues: [
    { code: "route-endpoint", invariant: "route-destination-known" },
    { code: "route-endpoint", invariant: "route-destination-known" },
  ],
});
assert.equal(legacy.compatibility.status, "legacy-supported");
assert.deepEqual(legacy.codes, ["route-endpoint"]);
assert.deepEqual(legacy.invariants, ["route-destination-known"]);
assert.deepEqual(legacy.severities, []);
assert.equal(legacy.highestSeverity, null);

const current = normalizeVersionedDiagnostics({
  contractVersion: 3,
  valid: true,
  diagnostics: {
    issueCount: 1,
    codes: ["route-navigation"],
    invariants: ["route-distance-finite"],
    severities: ["error"],
    highestSeverity: "error",
  },
});
assert.equal(current.valid, true);
assert.deepEqual(current.severities, ["error"]);
assert.equal(current.highestSeverity, "error");

const future = normalizeVersionedDiagnostics({ contractVersion: 9, valid: true, diagnostics: { issueCount: 0 } });
assert.equal(future.valid, false, "unsupported reports cannot be treated as valid");
assert.equal(future.compatibility.status, "future");
assert.doesNotThrow(() => JSON.stringify([legacy, current, future]));

console.log("world validator compatibility tests passed");