import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { buildArchipelago } = await loadModule("../src/world/archipelago.js");
const { validateWorldContract, WORLD_CONTRACT_VERSION } = await loadModule("../src/world/validation.js");

const world = buildArchipelago({ seed: 20260730, count: 64, radius: 11000, minGap: 390 });
const clean = validateWorldContract(world);
assert.equal(clean.contractVersion, WORLD_CONTRACT_VERSION);
assert.equal(clean.valid, true);
assert.deepEqual(clean.issues, []);
assert.equal(clean.counts.islands, 64);
assert.equal(clean.counts.uniqueIslandIds, 64);
assert.equal(clean.counts.uniqueRouteDiscoveryIds, world.routes.length);
assert.deepEqual(clean.diagnostics, {
  issueCount: 0,
  highestSeverity: null,
  severities: [],
  codes: [],
  invariants: [],
  bySeverity: {},
  byCode: {},
  byInvariant: {},
});
assert.doesNotThrow(() => JSON.stringify(clean));

const broken = structuredClone(world);
broken.islands.push({ ...broken.islands[0] });
broken.islands[1].regionId = "missing-region";
broken.routes[0].toIslandId = "missing-island";
broken.routes[0].navigation.distance = Number.NaN;
broken.routes[0].navigation.bearingFrom = Math.PI * 2 + 0.1;
broken.routes[0].navigation.cruiseAltitude = broken.routes[0].navigation.minimumAltitude;
broken.routes[0].navigation.fogRisk.score = 1.5;
broken.routes[0].discovery.endpointIslandIds = [broken.routes[0].toIslandId, broken.routes[0].fromIslandId];
broken.routes[1].discovery.id = broken.routes[0].discovery.id;
broken.regions[0].adjacentRegionIds.push(broken.regions[0].adjacentRegionIds[0]);
broken.regions[0].adjacentRegionIds.push(broken.regions[0].id);
broken.regions[0].adjacentRegionIds.push("missing-region");
const asymmetricNeighbor = broken.regions.find((region) => region.id === broken.regions[0].adjacentRegionIds[0]);
asymmetricNeighbor.adjacentRegionIds = asymmetricNeighbor.adjacentRegionIds.filter((id) => id !== broken.regions[0].id);

const first = validateWorldContract(broken);
const second = validateWorldContract(broken);
assert.equal(first.valid, false);
assert.deepEqual(first, second, "validation results must be deterministic");
assert.equal(first.diagnostics.issueCount, first.issues.length);
assert.equal(first.diagnostics.highestSeverity, "critical");
assert.deepEqual(first.diagnostics.severities, ["critical", "error", "warning"]);
assert.equal(Object.values(first.diagnostics.bySeverity).reduce((sum, count) => sum + count, 0), first.issues.length);
assert.deepEqual(first.diagnostics.codes, Object.keys(first.diagnostics.byCode).sort());
assert.deepEqual(first.diagnostics.invariants, Object.keys(first.diagnostics.byInvariant).sort());
assert(first.issues.every((entry) => ["critical", "error", "warning"].includes(entry.severity)));
assert(first.issues.some((entry) => entry.invariant === "island-id-unique" && entry.severity === "critical"));
assert(first.issues.some((entry) => entry.invariant === "route-distance-finite" && entry.severity === "error"));
assert(first.issues.some((entry) => entry.invariant === "region-adjacency-symmetric" && entry.severity === "warning"));
const severityRank = { critical: 0, error: 1, warning: 2 };
assert.deepEqual(
  [...first.issues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]
    || a.invariant.localeCompare(b.invariant)
    || a.subject.localeCompare(b.subject)
    || a.code.localeCompare(b.code)
    || a.message.localeCompare(b.message)),
  first.issues,
);
assert.doesNotThrow(() => JSON.stringify(first));

console.log("world validation tests passed");
