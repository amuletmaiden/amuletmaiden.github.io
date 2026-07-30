import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rankingSource = await readFile(new URL("../src/world/route-ranking.js", import.meta.url), "utf8");
const rankingUrl = `data:text/javascript;base64,${Buffer.from(rankingSource).toString("base64")}`;
const guidanceSource = (await readFile(new URL("../src/core/route-guidance.js", import.meta.url), "utf8"))
  .replace('"../world/route-ranking.js"', `"${rankingUrl}"`);
const guidanceUrl = `data:text/javascript;base64,${Buffer.from(guidanceSource).toString("base64")}`;
const { selectRouteGuidance } = await import(guidanceUrl);

const world = {
  islands: [
    { id: "a", name: "A", regionId: "north", x: 0, z: 0 },
    { id: "b", name: "B", regionId: "north", x: 1000, z: 0 },
    { id: "c", name: "C", regionId: "south", x: 0, z: 1800 },
  ],
  routes: [
    {
      id: "route:a-b",
      fromIslandId: "a",
      toIslandId: "b",
      fromRegionId: "north",
      toRegionId: "north",
      navigation: {
        distance: 1000,
        bearingFrom: Math.PI / 2,
        bearingTo: Math.PI * 1.5,
        minimumAltitude: 100,
        cruiseAltitude: 200,
        fogRisk: { score: 0.1, level: "low" },
      },
    },
    {
      id: "route:a-c",
      fromIslandId: "a",
      toIslandId: "c",
      fromRegionId: "north",
      toRegionId: "south",
      navigation: {
        distance: 1800,
        bearingFrom: 0,
        bearingTo: Math.PI,
        minimumAltitude: 200,
        cruiseAltitude: 320,
        fogRisk: { score: 0.5, level: "moderate" },
      },
    },
  ],
};

{
  const result = selectRouteGuidance({
    world,
    island: { ...world.islands[0], position: { x: 100, z: 0 } },
    discoveredRouteIds: ["route:a-b", "route:a-c"],
    altitude: 180,
    preferredRouteId: "route:a-c",
  });
  assert.equal(result.preferredRouteId, "route:a-c");
  assert.equal(result.guidance.routeId, "route:a-c");
  assert.equal(result.guidance.destinationName, "C");
  assert.equal(result.guidance.fallbackFromPreferred, false);
  assert(result.guidance.progress >= 0 && result.guidance.progress <= 1);
}

{
  const result = selectRouteGuidance({
    world,
    island: { ...world.islands[0], position: { x: 200, z: 0 } },
    discoveredRouteIds: ["route:a-b"],
    altitude: 180,
    preferredRouteId: "route:a-c",
  });
  assert.equal(result.preferredRouteId, "route:a-b", "undiscovered preferred route falls back to verified ranking");
  assert.equal(result.guidance.routeId, "route:a-b");
  assert.equal(result.guidance.fallbackFromPreferred, true);
}

{
  const result = selectRouteGuidance({
    world,
    island: { ...world.islands[1], position: { x: 900, z: 0 } },
    discoveredRouteIds: ["route:a-b", "route:a-c"],
    altitude: 180,
    preferredRouteId: "route:a-c",
  });
  assert.equal(result.preferredRouteId, "route:a-b", "disconnected preferred route falls back to a connected route");
  assert.equal(result.guidance.destinationIslandId, "a");
  assert.equal(result.guidance.fallbackFromPreferred, true);
}

assert.deepEqual(selectRouteGuidance({ world, island: null, discoveredRouteIds: [] }), {
  guidance: null,
  preferredRouteId: null,
});
assert.deepEqual(selectRouteGuidance({
  world,
  island: { ...world.islands[2], position: { x: 0, z: 1800 } },
  discoveredRouteIds: [],
}), {
  guidance: null,
  preferredRouteId: null,
});

console.log("route-guidance tests passed");