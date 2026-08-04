import assert from "node:assert/strict";
import test from "node:test";
import { planEnvironmentalResponses } from "../src/content/environmental-responses.js";

const accepted = [
  {
    contractId: "listening-pool",
    acknowledgementKey: "mystery.listeningPool.complete",
    soundHookId: "mystery-listening-pool",
  },
];

test("emits one restrained response for a newly accepted contract", () => {
  const result = planEnvironmentalResponses({ accepted });
  assert.deepEqual(result.responses, [{
    id: "response:listening-pool",
    contractId: "listening-pool",
    acknowledgementKey: "mystery.listeningPool.complete",
    soundHookId: "mystery-listening-pool",
    motion: "subtle",
    atmosphere: "water-listens",
  }]);
  assert.deepEqual(result.acknowledgementState.acknowledgedContractIds, ["listening-pool"]);
});

test("suppresses duplicate acknowledgements across frames", () => {
  const result = planEnvironmentalResponses({
    accepted,
    previousAcknowledgementIds: ["listening-pool"],
  });
  assert.deepEqual(result.responses, []);
  assert.deepEqual(result.telemetry.suppressedIds, ["listening-pool"]);
  assert.equal(result.telemetry.latestSuppressionReason, "already-acknowledged");
});

test("reduced motion preserves meaning without animation", () => {
  const result = planEnvironmentalResponses({ accepted, reducedMotion: true });
  assert.equal(result.responses[0].motion, "none");
  assert.equal(result.responses[0].acknowledgementKey, "mystery.listeningPool.complete");
});

test("sound preference removes hooks without removing acknowledgement", () => {
  const result = planEnvironmentalResponses({ accepted, soundEnabled: false });
  assert.equal(result.responses[0].soundHookId, null);
  assert.equal(result.responses[0].contractId, "listening-pool");
});

test("stable ordering emits only the newest deterministic response", () => {
  const result = planEnvironmentalResponses({
    accepted: [
      accepted[0],
      {
        contractId: "high-passage",
        acknowledgementKey: "mystery.highPassage.complete",
        soundHookId: "mystery-high-passage",
      },
    ],
  });
  assert.equal(result.responses.length, 1);
  assert.equal(result.responses[0].contractId, "listening-pool");
});

test("malformed and duplicate candidates are ignored", () => {
  const result = planEnvironmentalResponses({
    accepted: [null, {}, accepted[0], accepted[0], { contractId: "broken" }],
  });
  assert.equal(result.telemetry.candidateCount, 1);
  assert.equal(result.responses.length, 1);
});

test("does not mutate caller inputs and returns JSON-safe output", () => {
  const input = {
    accepted: structuredClone(accepted),
    previousAcknowledgementIds: ["high-passage"],
    reducedMotion: false,
  };
  const before = structuredClone(input);
  const result = planEnvironmentalResponses(input);
  assert.deepEqual(input, before);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("empty input has a bounded quiet fallback", () => {
  const result = planEnvironmentalResponses();
  assert.deepEqual(result.responses, []);
  assert.deepEqual(result.telemetry.emittedIds, []);
  assert.equal(result.telemetry.candidateCount, 0);
});
