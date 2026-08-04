import assert from "node:assert/strict";
import {
  DEFAULT_EXPLORATION_CONTRACTS,
  evaluateExplorationContracts,
} from "../src/content/exploration-contracts.js";

function evaluate(overrides = {}) {
  return evaluateExplorationContracts({
    contracts: DEFAULT_EXPLORATION_CONTRACTS,
    exploration: {},
    signals: [],
    reducedMotion: false,
    ...overrides,
  });
}

{
  const result = evaluate({
    signals: ["approach:high-passage", "altitude:high-band"],
  });
  assert.equal(result.accepted[0].contractId, "high-passage");
  assert.equal(result.telemetry.latestAcceptedId, "high-passage");
}

{
  const result = evaluate({ signals: ["altitude:high-band"] });
  assert.deepEqual(result.accepted, []);
  assert.equal(result.rejected[0].reason, "out-of-order:altitude:high-band");
}

{
  const result = evaluate({
    signals: [
      "landmark:three-stone-1",
      "landmark:three-stone-1",
      "landmark:three-stone-2",
      "landmark:three-stone-3",
    ],
  });
  assert.equal(result.accepted.filter((entry) => entry.contractId === "three-stone-chain").length, 1);
}

{
  const blocked = evaluate({
    signals: ["landmark:three-stone-2", "landmark:three-stone-1"],
  });
  assert.equal(blocked.rejected[0].reason, "out-of-order:landmark:three-stone-2");

  const recovered = evaluate({
    exploration: {
      progressByContract: {
        "three-stone-chain": ["landmark:three-stone-1"],
      },
    },
    signals: ["landmark:three-stone-2", "landmark:three-stone-3"],
  });
  assert.equal(recovered.accepted[0].contractId, "three-stone-chain");
}

{
  const proximityOnly = evaluate({
    signals: ["landmark:listening-pool", "proximity:listening-pool"],
  });
  assert.deepEqual(proximityOnly.accepted, []);

  const explicit = evaluate({
    signals: ["landmark:listening-pool", "interact:listening-pool"],
  });
  assert.equal(explicit.accepted[0].contractId, "listening-pool");
}

{
  const animated = evaluate({
    signals: ["landmark:listening-pool", "interact:listening-pool"],
  });
  const reduced = evaluate({
    signals: ["landmark:listening-pool", "interact:listening-pool"],
    reducedMotion: true,
  });
  assert.deepEqual(
    reduced.state.completedContractIds,
    animated.state.completedContractIds,
  );
  assert.equal(reduced.state.acknowledgements[0].motion, "none");
  assert.equal(animated.state.acknowledgements[0].motion, "subtle");
}

{
  const result = evaluateExplorationContracts({
    contracts: [
      null,
      { id: "missing-fields" },
      {
        id: "duplicate-prerequisite",
        kind: "ordered-signals",
        prerequisites: ["a", "a"],
        completionSignal: "a",
      },
      DEFAULT_EXPLORATION_CONTRACTS[0],
    ],
    signals: [{ id: "unknown:signal" }, {}, null],
  });
  assert.equal(result.telemetry.malformedDefinitionCount, 3);
  assert.deepEqual(result.accepted, []);
}

{
  const contracts = [
    DEFAULT_EXPLORATION_CONTRACTS[2],
    DEFAULT_EXPLORATION_CONTRACTS[0],
    DEFAULT_EXPLORATION_CONTRACTS[1],
  ];
  const result = evaluateExplorationContracts({ contracts });
  assert.deepEqual(result.telemetry.activeContractIds, [
    "high-passage",
    "listening-pool",
    "three-stone-chain",
  ]);
}

{
  const contracts = structuredClone(DEFAULT_EXPLORATION_CONTRACTS);
  const exploration = {
    completedContractIds: [],
    acceptedSignalIds: ["approach:high-passage"],
    progressByContract: { "three-stone-chain": ["landmark:three-stone-1"] },
  };
  const signals = [{ id: "altitude:high-band" }];
  const before = JSON.stringify({ contracts, exploration, signals });
  const result = evaluateExplorationContracts({ contracts, exploration, signals });
  assert.equal(JSON.stringify({ contracts, exploration, signals }), before);
  assert.doesNotThrow(() => JSON.stringify(result));
}

{
  const result = evaluate({
    exploration: { completedContractIds: ["high-passage"] },
    signals: ["approach:high-passage", "altitude:high-band"],
  });
  assert.equal(result.accepted.some((entry) => entry.contractId === "high-passage"), false);
  assert.equal(result.state.completedContractIds.includes("high-passage"), true);
}

console.log("exploration contract tests passed");
