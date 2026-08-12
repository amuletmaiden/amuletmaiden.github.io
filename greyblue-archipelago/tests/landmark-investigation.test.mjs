import assert from "node:assert/strict";
import { deriveLandmarkInvestigation } from "../src/core/landmark-investigation.js";

const island = Object.freeze({
  id: "isle-7",
  regionId: "hushed-reach",
  x: 100,
  z: -40,
  landmarkRecord: Object.freeze({
    id: "isle-7:landmark",
    encounter: Object.freeze({ triggerRadius: 180, minimumAltitude: 30, approachBearing: 0.4 }),
  }),
});
const base = {
  island,
  discovered: true,
  position: { x: 120, y: 80, z: -20 },
  yaw: 0.4,
  airborne: true,
};

{
  const result = deriveLandmarkInvestigation(base);
  assert.deepEqual(result.state, { available: true, prompt: "investigate" });
  assert.equal(result.completed, false);
  assert.equal(result.event, null);
}

{
  const result = deriveLandmarkInvestigation({ ...base, interact: true });
  assert.equal(result.completed, true);
  assert.deepEqual(result.state, { available: false, prompt: null });
  assert.deepEqual(result.event, { landmarkId: "isle-7:landmark", regionId: "hushed-reach" });
  assert.deepEqual(Object.keys(result.event).sort(), ["landmarkId", "regionId"]);
}

for (const patch of [
  { discovered: false },
  { investigated: true },
  { position: { x: 500, y: 80, z: -20 } },
  { position: { x: 120, y: 20, z: -20 } },
  { yaw: 2.2 },
  { paused: true },
  { recovering: true },
  { restoring: true },
  { crossing: true },
  { position: { x: Number.NaN, y: 80, z: -20 } },
]) {
  const result = deriveLandmarkInvestigation({ ...base, ...patch, interact: true });
  assert.deepEqual(result.state, { available: false, prompt: null });
  assert.equal(result.completed, false);
  assert.equal(result.event, null);
}

{
  const result = deriveLandmarkInvestigation({
    ...base,
    position: { x: 120, y: 5, z: -20 },
    yaw: 2.8,
    airborne: false,
    grounded: true,
  });
  assert.deepEqual(result.state, { available: true, prompt: "investigate" }, "settled exploration ignores airborne heading/altitude gates");
}

{
  const before = JSON.stringify(island);
  deriveLandmarkInvestigation({ ...base, interact: true });
  assert.equal(JSON.stringify(island), before, "authored world metadata must remain immutable");
}

{
  const result = deriveLandmarkInvestigation({
    ...base,
    island: { id: "isle-x", regionId: "hushed-reach", x: 0, z: 0 },
  });
  assert.deepEqual(result.state, { available: false, prompt: null });
}

console.log("landmark-investigation tests passed");
