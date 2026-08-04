const MAX_ACTIVE_HINTS = 1;
const MAX_ACKNOWLEDGEMENTS = 1;

export function evaluateExplorationContracts(input = {}) {
  const contracts = normalizeContracts(input.contracts);
  const exploration = normalizeExploration(input.exploration);
  const signals = normalizeSignals(input.signals);
  const reducedMotion = Boolean(input.reducedMotion);

  const completed = new Set(exploration.completedContractIds);
  const accepted = [];
  const rejected = [];
  const active = [];
  let malformedDefinitionCount = contracts.malformedCount;

  for (const contract of contracts.valid) {
    if (completed.has(contract.id)) continue;

    const progress = exploration.progressByContract[contract.id] ?? [];
    const result = evaluateContract(contract, progress, signals, exploration);

    if (result.accepted) {
      completed.add(contract.id);
      accepted.push({
        contractId: contract.id,
        signalId: result.signalId,
        acknowledgementKey: contract.acknowledgementKey,
        soundHookId: contract.soundHookId,
      });
      continue;
    }

    if (result.rejectedReason) {
      rejected.push({ contractId: contract.id, reason: result.rejectedReason });
    }

    active.push({
      contractId: contract.id,
      kind: contract.kind,
      hintKey: contract.hintKey,
      nextRequirement: result.nextRequirement,
    });
  }

  accepted.sort(compareByContractId);
  rejected.sort(compareByContractId);
  active.sort(compareByContractId);

  const newestAccepted = accepted.at(-1) ?? null;
  const activeHints = active
    .filter((entry) => entry.hintKey)
    .slice(0, MAX_ACTIVE_HINTS)
    .map((entry) => ({
      contractId: entry.contractId,
      hintKey: entry.hintKey,
      nextRequirement: entry.nextRequirement,
      motion: reducedMotion ? "none" : "subtle",
    }));

  const acknowledgements = newestAccepted?.acknowledgementKey
    ? [{
        contractId: newestAccepted.contractId,
        acknowledgementKey: newestAccepted.acknowledgementKey,
        soundHookId: newestAccepted.soundHookId,
        motion: reducedMotion ? "none" : "subtle",
      }].slice(0, MAX_ACKNOWLEDGEMENTS)
    : [];

  return {
    state: {
      completedContractIds: [...completed].sort(),
      activeHints,
      acknowledgements,
      reducedMotion,
    },
    accepted,
    rejected,
    telemetry: {
      activeContractIds: active.map((entry) => entry.contractId),
      latestAcceptedId: newestAccepted?.contractId ?? null,
      latestRejectedReason: rejected.at(-1)?.reason ?? null,
      malformedDefinitionCount,
    },
  };
}

export const DEFAULT_EXPLORATION_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "high-passage",
    kind: "ordered-signals",
    prerequisites: Object.freeze(["approach:high-passage", "altitude:high-band"]),
    completionSignal: "altitude:high-band",
    hintKey: "mystery.highPassage.hint",
    acknowledgementKey: "mystery.highPassage.complete",
    soundHookId: "mystery-high-passage",
  }),
  Object.freeze({
    id: "three-stone-chain",
    kind: "ordered-signals",
    prerequisites: Object.freeze([
      "landmark:three-stone-1",
      "landmark:three-stone-2",
      "landmark:three-stone-3",
    ]),
    completionSignal: "landmark:three-stone-3",
    hintKey: "mystery.threeStone.hint",
    acknowledgementKey: "mystery.threeStone.complete",
    soundHookId: "mystery-three-stone",
  }),
  Object.freeze({
    id: "listening-pool",
    kind: "ordered-signals",
    prerequisites: Object.freeze(["landmark:listening-pool", "interact:listening-pool"]),
    completionSignal: "interact:listening-pool",
    hintKey: "mystery.listeningPool.hint",
    acknowledgementKey: "mystery.listeningPool.complete",
    soundHookId: "mystery-listening-pool",
  }),
]);

function evaluateContract(contract, progress, signals, exploration) {
  const observed = new Set([...progress, ...exploration.acceptedSignalIds]);
  const orderedSignals = signals.filter((signal) => contract.prerequisites.includes(signal.id));
  let nextIndex = 0;

  while (nextIndex < contract.prerequisites.length && observed.has(contract.prerequisites[nextIndex])) {
    nextIndex += 1;
  }

  for (const signal of orderedSignals) {
    if (observed.has(signal.id)) continue;
    const expected = contract.prerequisites[nextIndex];
    if (signal.id !== expected) {
      return {
        accepted: false,
        rejectedReason: `out-of-order:${signal.id}`,
        nextRequirement: expected ?? null,
      };
    }
    observed.add(signal.id);
    nextIndex += 1;
  }

  const complete = nextIndex === contract.prerequisites.length
    && observed.has(contract.completionSignal);

  return {
    accepted: complete,
    signalId: complete ? contract.completionSignal : null,
    rejectedReason: null,
    nextRequirement: complete ? null : contract.prerequisites[nextIndex] ?? contract.completionSignal,
  };
}

function normalizeContracts(value) {
  const source = Array.isArray(value) ? value : [];
  const valid = [];
  let malformedCount = 0;

  for (const item of source) {
    const normalized = normalizeContract(item);
    if (!normalized) {
      malformedCount += 1;
      continue;
    }
    valid.push(normalized);
  }

  valid.sort(compareById);
  return { valid, malformedCount };
}

function normalizeContract(value) {
  if (!value || typeof value !== "object") return null;
  const id = stableString(value.id);
  const kind = stableString(value.kind);
  const completionSignal = stableString(value.completionSignal);
  const prerequisites = Array.isArray(value.prerequisites)
    ? value.prerequisites.map(stableString).filter(Boolean)
    : [];

  if (!id || !kind || !completionSignal || prerequisites.length === 0) return null;
  if (new Set(prerequisites).size !== prerequisites.length) return null;
  if (!prerequisites.includes(completionSignal)) return null;

  return {
    id,
    kind,
    completionSignal,
    prerequisites,
    hintKey: stableString(value.hintKey),
    acknowledgementKey: stableString(value.acknowledgementKey),
    soundHookId: stableString(value.soundHookId),
  };
}

function normalizeExploration(value) {
  const source = value && typeof value === "object" ? value : {};
  const completedContractIds = uniqueStrings(source.completedContractIds);
  const acceptedSignalIds = uniqueStrings(source.acceptedSignalIds);
  const progressByContract = {};

  if (source.progressByContract && typeof source.progressByContract === "object") {
    for (const [key, entries] of Object.entries(source.progressByContract)) {
      const id = stableString(key);
      if (!id) continue;
      progressByContract[id] = uniqueStrings(entries);
    }
  }

  return { completedContractIds, acceptedSignalIds, progressByContract };
}

function normalizeSignals(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];

  for (const item of value) {
    const id = stableString(typeof item === "string" ? item : item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id });
  }

  return result;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stableString).filter(Boolean))].sort();
}

function stableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareById(a, b) {
  return a.id.localeCompare(b.id);
}

function compareByContractId(a, b) {
  return a.contractId.localeCompare(b.contractId);
}
