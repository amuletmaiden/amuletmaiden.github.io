import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/world/route-ranking.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { rankConnectedRoutes } = await import(moduleUrl);

const world = {
  islands: [
    { id: "a", regionId: "north" },
    { id: "b", regionId: "north" },
    { id: "c", regionId: "south" },
    { id: "d", regionId: "west" },
  ],
  routes: [
    {
      id: "route:a-b",
      fromIslandId: "a",
      toIslandId: "b",
      fromRegionId: "north",
      toRegionId: "north",
      navigation: {
        distance: 900,
        bearingFrom: 0.2,
        bearingTo: 3.3415926535897933,
        minimumAltitude: 120,
        cruiseAltitude: 210,
        fogRisk: { score: 0.2, level: "low" },
      },
    },
    {
      id: "route:a-c",
      fromIslandId: "a",
      toIslandId: "c",
      fromRegionId: "north",
      toRegionId: "south",
      navigation: {
        distance: 1400,
        bearingFrom: 1.1,
        bearingTo: 4.241592653589793,
        minimumAltitude: 300,
        cruiseAltitude: 420,
        fogRisk: { score: 0.75, level: "high" },
      },
    },
    {
      id: "route:d-a",
      fromIslandId: "d",
      toIslandId: "a",
      fromRegionId: "west",
      toRegionId: "north",
      navigation: {
        distance: 900,
        bearingFrom: 2.4,
        bearingTo: 5.541592653589793,
        minimumAltitude: 120,
        cruiseAltitude: 210,
        fogRisk: { score: 0.2, level: "low" },
      },
    },
    {
      id: "route:b-c",
      fromIslandId: "b",
      toIslandId: "c",
      fromRegionId: "north",
      toRegionId: "south",
      navigation: {
        distance: 500,
        bearingFrom: 0.8,
        bearingTo: 3.941592653589793,
        minimumAltitude: 90,
        cruiseAltitude: 160,
        fogRisk: { score: 0.1, level: "low" },
      },
    },
  ],
};

{
  const ranked = rankConnectedRoutes(world, {
    islandId: "a",
    discoveredRouteIds: new Set(["route:a-b", "route:a-c", "route:d-a", "route:b-c"]),
    altitude: 180,
  });

  assert.deepEqual(ranked.map((entry) => entry.routeId), ["route:a-b", "route:d-a", "route:a-c"]);
  assert.equal(ranked[0].destinationIslandId, "b");
  assert.equal(ranked[1].destinationIslandId, "d");
  assert.equal(ranked[1].bearing, world.routes[2].navigation.bearingTo, "reverse traversal uses reciprocal bearing");
  assert.equal(ranked[2].altitudeDeficit, 120);
  assert.equal(ranked[2].fogRisk.level, "high");
  assert.doesNotThrow(() => JSON.stringify(ranked));
}

{
  const ranked = rankConnectedRoutes(world, {
    islandId: "a",
    discoveredRouteIds: ["route:a-b", "route:a-c"],
    altitude: 500,
    preferredRegionId: "south",
  });
  assert.equal(ranked[0].routeId, "route:a-b", "preference remains a bounded nudge rather than overriding all safety costs");
  assert(ranked[1].score > ranked[0].score);
}

{
  const first = rankConnectedRoutes(world, {
    islandId: "a",
    discoveredRouteIds: ["route:d-a", "route:a-b"],
    altitude: 180,
  });
  const second = rankConnectedRoutes(world, {
    islandId: "a",
    discoveredRouteIds: ["route:a-b", "route:d-a"],
    altitude: 180,
  });
  assert.deepEqual(first, second, "input discovery order cannot affect ranking");
  assert.deepEqual(first.map((entry) => entry.routeId), ["route:a-b", "route:d-a"], "ties break by stable route id");
}

assert.deepEqual(rankConnectedRoutes(world, { islandId: "missing", discoveredRouteIds: ["route:a-b"] }), []);
assert.deepEqual(rankConnectedRoutes(null, { islandId: "a" }), []);

console.log("route-ranking tests passed");