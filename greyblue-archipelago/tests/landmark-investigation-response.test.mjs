import assert from "node:assert/strict";
import { deriveLandmarkInvestigationResponse } from "../src/core/landmark-investigation-response.js";

function island({ id = "known", regionId = "region-a", landmarkId = "known-landmark", responseClass = "resonance", revealText = "A drowned bell answers the rain." } = {}) {
  return {
    id,
    regionId,
    x: 10,
    z: 20,
    hiddenDetail: "must never escape",
    landmarkRecord: {
      id: landmarkId,
      encounter: {
        class: responseClass,
        revealText,
        triggerRadius: 180,
        approachBearing: 0.8,
        minimumAltitude: 42,
      },
    },
  };
}

const known = island({});
const base = {
  completed: true,
  event: { landmarkId: "known-landmark", regionId: "region-a" },
  islands: [known],
  discoveredIslandIds: new Set(["known"]),
};

{
  const result = deriveLandmarkInvestigationResponse(base);
  assert.deepEqual(result, {
    active: true,
    text: "A drowned bell answers the rain.",
    responseClass: "resonance",
  });
  assert.deepEqual(Object.keys(result).sort(), ["active", "responseClass", "text"]);
  assert.equal(JSON.stringify(result).includes("hiddenDetail"), false);
  assert.equal(JSON.stringify(result).includes("triggerRadius"), false);
}

for (const responseClass of ["resonance", "instrument", "relic", "threshold"]) {
  const result = deriveLandmarkInvestigationResponse({
    ...base,
    islands: [island({ responseClass, revealText: `Authored ${responseClass} response.` })],
  });
  assert.equal(result.responseClass, responseClass);
  assert.equal(result.text, `Authored ${responseClass} response.`);
}

for (const override of [
  { completed: false },
  { event: null },
  { event: { landmarkId: "unknown", regionId: "region-a" } },
  { event: { landmarkId: "known-landmark", regionId: "region-b" } },
  { discoveredIslandIds: [] },
  { paused: true },
  { recovering: true },
  { restoring: true },
  { crossing: true },
]) {
  assert.deepEqual(deriveLandmarkInvestigationResponse({ ...base, ...override }), {
    active: false,
    text: null,
    responseClass: null,
  });
}

{
  const malformedText = deriveLandmarkInvestigationResponse({
    ...base,
    islands: [island({ revealText: "   " })],
  });
  const malformedClass = deriveLandmarkInvestigationResponse({
    ...base,
    islands: [island({ responseClass: "secret-navigation-class" })],
  });
  assert.equal(malformedText.active, false);
  assert.equal(malformedClass.active, false);
}

{
  const islands = structuredClone([known]);
  const discoveredIslandIds = new Set(["known"]);
  const before = JSON.stringify(islands);
  deriveLandmarkInvestigationResponse({ ...base, islands, discoveredIslandIds });
  assert.equal(JSON.stringify(islands), before, "authored world records remain immutable");
  assert.deepEqual([...discoveredIslandIds], ["known"], "discovery caller remains immutable");
}

console.log("landmark investigation response tests passed");
