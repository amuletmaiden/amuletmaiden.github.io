import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const investigationSource = await readFile(new URL("../src/core/landmark-investigation.js", import.meta.url), "utf8");
const investigationUrl = `data:text/javascript;base64,${Buffer.from(investigationSource).toString("base64")}`;
const liveSource = (await readFile(new URL("../src/core/landmark-investigation-live.js", import.meta.url), "utf8"))
  .replace('"./landmark-investigation.js"', `"${investigationUrl}"`);
const liveUrl = `data:text/javascript;base64,${Buffer.from(liveSource).toString("base64")}`;
const { deriveLiveLandmarkInvestigation } = await import(liveUrl);

function island(id, x, regionId = "region-a") {
  return {
    id,
    regionId,
    x,
    z: 0,
    landmarkRecord: {
      id: `${id}-landmark`,
      encounter: {
        triggerRadius: 120,
        minimumAltitude: 20,
        approachBearing: 0,
      },
    },
  };
}

const islands = [island("near", 20), island("far", 70), island("other-region", 10, "region-b")];
const base = {
  islands,
  discoveredIslandIds: new Set(["near", "far", "other-region"]),
  explorationEvents: [],
  currentRegionId: "region-a",
  position: { x: 0, y: 40, z: 0 },
  yaw: 0,
  airborne: true,
  grounded: false,
};

{
  const result = deriveLiveLandmarkInvestigation(base);
  assert.deepEqual(result.state, { available: true, prompt: "investigate" });
  assert.equal(result.completed, false);
  assert.equal(result.event, null);
}

{
  const result = deriveLiveLandmarkInvestigation({ ...base, interact: true });
  assert.equal(result.completed, true);
  assert.deepEqual(result.event, { landmarkId: "near-landmark", regionId: "region-a" });
  assert.deepEqual(result.state, { available: false, prompt: null });
}

{
  const result = deriveLiveLandmarkInvestigation({
    ...base,
    explorationEvents: [{ kind: "landmark-investigated", landmarkId: "near-landmark", regionId: "region-a" }],
    interact: true,
  });
  assert.equal(result.completed, true, "next nearest eligible known landmark remains usable");
  assert.deepEqual(result.event, { landmarkId: "far-landmark", regionId: "region-a" });
}

{
  const hidden = deriveLiveLandmarkInvestigation({
    ...base,
    discoveredIslandIds: new Set(["other-region"]),
    interact: true,
  });
  assert.deepEqual(hidden, { state: { available: false, prompt: null }, completed: false, event: null });
}

{
  const interrupted = deriveLiveLandmarkInvestigation({ ...base, paused: true, interact: true });
  assert.equal(interrupted.completed, false);
  assert.equal(interrupted.state.available, false);
}

{
  const grounded = deriveLiveLandmarkInvestigation({
    ...base,
    position: { x: 0, y: 2, z: 0 },
    yaw: Math.PI,
    airborne: false,
    grounded: true,
    interact: true,
  });
  assert.equal(grounded.completed, true, "settled exploration does not require airborne approach gates");
}

{
  const input = {
    ...base,
    islands: structuredClone(islands),
    discoveredIslandIds: new Set(["near", "far"]),
    explorationEvents: [],
  };
  const before = JSON.stringify(input.islands);
  deriveLiveLandmarkInvestigation(input);
  assert.equal(JSON.stringify(input.islands), before, "world records remain immutable");
  assert.deepEqual([...input.discoveredIslandIds], ["near", "far"], "discovery caller remains immutable");
}

console.log("live landmark investigation tests passed");
