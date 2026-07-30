import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { buildArchipelago } = await loadModule("../src/world/archipelago.js");
const { validateWorldContract } = await loadModule("../src/world/validation.js");

const world = buildArchipelago({ seed: 20260730, count: 64, radius: 11000, minGap: 390 });
const clean = validateWorldContract(world);
assert.equal(clean.valid, true);
assert.deepEqual(clean.issues, []);
assert.equal(clean.counts.islands, 64);
assert.equal(clean.counts.uniqueIslandIds, 64);
assert.doesNotThrow(() => JSON.stringify(clean));

const broken = structuredClone(world);
broken.islands.push({ ...broken.islands[0] });
broken.routes[0].toIslandId = "missing-island";
broken.routes[0].navigation.distance = Number.NaN;
broken.routes[0].navigation.cruiseAltitude = broken.routes[0].navigation.minimumAltitude;
broken.routes[0].discovery.endpointIslandIds = [broken.routes[0].toIslandId, broken.routes[0].fromIslandId];
broken.regions[0].adjacentRegionIds.push("missing-region");
const asymmetricNeighbor = broken.regions.find((region) => region.id === broken.regions[0].adjacentRegionIds[0]);
asymmetricNeighbor.adjacentRegionIds = asymmetricNeighbor.adjacentRegionIds.filter((id) => id !== broken.regions[0].id);

const first = validateWorldContract(broken);
const second = validateWorldContract(broken);
assert.equal(first.valid, false);
assert.deepEqual(first, second, "validation results must be deterministic");
assert(first.issues.some((entry) => entry.code === "island-id" && entry.message === "duplicate id"));
assert(first.issues.some((entry) => entry.code === "route-endpoint"));
assert(first.issues.some((entry) => entry.code === "route-navigation" && entry.message.includes("distance")));
assert(first.issues.some((entry) => entry.code === "route-navigation" && entry.message.includes("cruiseAltitude")));
assert(first.issues.some((entry) => entry.code === "route-discovery"));
assert(first.issues.some((entry) => entry.code === "region-adjacency" && entry.message.includes("unknown adjacent")));
assert(first.issues.some((entry) => entry.code === "region-adjacency" && entry.message.includes("not symmetric")));
assert.deepEqual([...first.issues].sort((a, b) => a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject) || a.message.localeCompare(b.message)), first.issues);
assert.doesNotThrow(() => JSON.stringify(first));

console.log("world validation tests passed");
