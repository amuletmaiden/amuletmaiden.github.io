import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { buildArchipelago } = await importSource("../src/world/archipelago.js");
const {
  DEFAULT_MYSTERY_PROFILE,
  enrichWorldMystery,
  landmarkEncounterFor,
  mysteryProfileForRegion,
  routeDiscoveryFor,
} = await importSource("../src/world/mystery.js");

const world = buildArchipelago({ seed: 89421, count: 64, radius: 11000, minGap: 390 });
const first = enrichWorldMystery(world);
const second = enrichWorldMystery(world);
assert.deepEqual(first, second, "mystery metadata must be deterministic for stable world input");
assert.equal(Object.keys(first.regionMystery).length, world.regions.length);

for (const region of world.regions) {
  const profile = first.regionMystery[region.id];
  assert(profile, `${region.id} lacks a mystery profile`);
  assert(/^#[0-9a-f]{6}$/i.test(profile.fog.color));
  assert(profile.fog.near > 0 && profile.fog.far > profile.fog.near);
  assert(profile.fog.density > 0);
  assert(profile.visibility && profile.cue);
}
assert.deepEqual(mysteryProfileForRegion("unknown-region"), DEFAULT_MYSTERY_PROFILE);

const landmarkIslands = world.islands.filter((island) => island.landmarkRecord);
assert.equal(first.landmarkEncounters.length, landmarkIslands.length);
for (const island of landmarkIslands) {
  const encounter = landmarkEncounterFor(island);
  assert.equal(encounter.islandId, island.id);
  assert.equal(encounter.regionId, island.regionId);
  assert(encounter.triggerRadius >= 120 && encounter.triggerRadius <= 260);
  assert.deepEqual(encounter.revealOrder, ["silhouette", "title", "clue"]);
}
assert.equal(landmarkEncounterFor(world.islands.find((island) => !island.landmarkRecord)), null);

const islandById = new Map(world.islands.map((island) => [island.id, island]));
assert.equal(first.routeDiscoveries.length, world.routes.length);
for (const route of world.routes) {
  const discovery = routeDiscoveryFor(route, islandById);
  const from = islandById.get(route.fromIslandId);
  const to = islandById.get(route.toIslandId);
  assert.equal(discovery.routeId, route.id);
  assert.equal(discovery.fromIslandId, from.id);
  assert.equal(discovery.toIslandId, to.id);
  assert.equal(discovery.midpoint.x, (from.x + to.x) * 0.5);
  assert.equal(discovery.midpoint.z, (from.z + to.z) * 0.5);
  assert(discovery.triggerRadius >= 180 && discovery.triggerRadius <= 520);
  assert(discovery.title.includes(from.name) && discovery.title.includes(to.name));
}

console.log(JSON.stringify({
  regions: Object.keys(first.regionMystery).length,
  landmarkEncounters: first.landmarkEncounters.length,
  routeDiscoveries: first.routeDiscoveries.length,
  status: "pass",
}));
