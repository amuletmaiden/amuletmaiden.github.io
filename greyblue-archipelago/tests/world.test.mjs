import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/world/archipelago.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  REGION_DEFINITIONS,
  activeIslands,
  buildArchipelago,
  updateActiveIslands,
} = await import(moduleUrl);

const options = { seed: 89421, count: 64, radius: 11000, minGap: 390 };
const first = buildArchipelago(options);
const second = buildArchipelago(options);
const different = buildArchipelago({ ...options, seed: options.seed + 1 });

assert.deepEqual(first, second, "the same seed must produce byte-stable world data");
assert.notDeepEqual(first.islands.slice(0, 4), different.islands.slice(0, 4), "different seeds should change geography");
assert.equal(first.islands.length, options.count, "requested island count should be met");
assert.equal(first.regions.length, REGION_DEFINITIONS.length, "all named regions should be represented in metadata");
assert.doesNotThrow(() => JSON.stringify(first), "world metadata must remain serialization-safe");

const ids = new Set();
const names = new Set();
for (const island of first.islands) {
  assert(!ids.has(island.id), `duplicate island id ${island.id}`);
  assert(!names.has(island.name), `duplicate island name ${island.name}`);
  ids.add(island.id);
  names.add(island.name);
  assert(island.regionId && island.regionName, `${island.id} lacks stable region metadata`);
  assert.equal(island.discovery.regionId, island.regionId);
  assert(island.discovery.threshold >= 180 && island.discovery.threshold <= 330);
  assert.equal(island.landingZones.length, 1);
  assert.equal(island.approachCorridors.length, 1);
  const zone = island.landingZones[0];
  const corridor = island.approachCorridors[0];
  assert(zone.radius > 0 && Number.isFinite(zone.heading));
  assert(corridor.width > 0 && corridor.maximumDescentRate > 0);
  assert(Number.isFinite(corridor.entry.x) && Number.isFinite(corridor.touchdown.z));
  if (island.landmarkRecord) {
    const encounter = island.landmarkRecord.encounter;
    assert(encounter && encounter.id.endsWith(":encounter"));
    assert(["resonance", "instrument", "relic", "threshold"].includes(encounter.class));
    assert(encounter.triggerRadius >= 150 && encounter.triggerRadius <= 260);
    assert(Number.isFinite(encounter.approachBearing));
    assert.equal(encounter.repeatable, false);
  }
}

for (let a = 0; a < first.islands.length; a += 1) {
  for (let b = a + 1; b < first.islands.length; b += 1) {
    const left = first.islands[a];
    const right = first.islands[b];
    const distance = Math.hypot(left.x - right.x, left.z - right.z);
    const required = options.minGap * (left.scale + right.scale) * 0.5;
    assert(distance + 1e-8 >= required, `${left.id} and ${right.id} violate minimum spacing`);
  }
}

const islandById = new Map(first.islands.map((island) => [island.id, island]));
assert(first.routes.length >= first.islands.length - first.regions.length, "regional route chains should connect the world");
for (const route of first.routes) {
  assert(islandById.has(route.fromIslandId), `${route.id} has unknown origin`);
  assert(islandById.has(route.toIslandId), `${route.id} has unknown destination`);
  assert.notEqual(route.fromIslandId, route.toIslandId, `${route.id} loops to itself`);
  assert.equal(route.discovery.endpointIslandIds[0], route.fromIslandId);
  assert.equal(route.discovery.endpointIslandIds[1], route.toIslandId);
  assert(route.discovery.revealRadius >= 360 && route.discovery.revealRadius <= 520);
  assert(Number.isFinite(route.discovery.midpoint.x) && Number.isFinite(route.discovery.midpoint.z));
}
for (const region of first.regions) {
  assert(region.islandIds.every((id) => islandById.get(id)?.regionId === region.id));
  if (region.islandIds.length) assert(region.anchorIslandId);
  const fog = region.fogProfile;
  assert(/^#[0-9a-f]{6}$/i.test(fog.color));
  assert(fog.near > 0 && fog.far > fog.near);
  assert(fog.density > 0 && fog.density < 0.001);
  assert(fog.altitudeThinning > 0 && fog.transitionDistance > 0);
}

const target = first.islands[0];
assert.deepEqual(activeIslands(first, { x: target.x, z: target.z }, 1).map((island) => island.id), [target.id]);
const hysteresisPosition = { x: target.x + 2000, z: target.z };
assert(!updateActiveIslands(first, hysteresisPosition, new Set(), { activateRange: 1800, deactivateRange: 2200 })
  .some((island) => island.id === target.id), "inactive island should not activate inside only the retention band");
assert(updateActiveIslands(first, hysteresisPosition, new Set([target.id]), { activateRange: 1800, deactivateRange: 2200 })
  .some((island) => island.id === target.id), "active island should remain loaded inside the retention band");
assert(!updateActiveIslands(first, { x: target.x + 2300, z: target.z }, new Set([target.id]), { activateRange: 1800, deactivateRange: 2200 })
  .some((island) => island.id === target.id), "active island should unload beyond the retention range");
assert.throws(
  () => updateActiveIslands(first, { x: 0, z: 0 }, new Set(), { activateRange: 2200, deactivateRange: 1800 }),
  RangeError,
);

console.log(JSON.stringify({
  seed: first.seed,
  islands: first.islands.length,
  regions: first.regions.length,
  routes: first.routes.length,
  landmarks: first.islands.filter((island) => island.landmarkRecord).length,
  status: "pass",
}));
