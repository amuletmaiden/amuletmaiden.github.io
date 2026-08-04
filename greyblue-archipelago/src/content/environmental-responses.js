const MAX_RESPONSES = 1;
const MAX_TELEMETRY_IDS = 8;

export function planEnvironmentalResponses(input = {}) {
  const accepted = normalizeAccepted(input.accepted);
  const previous = new Set(uniqueStrings(input.previousAcknowledgementIds));
  const reducedMotion = Boolean(input.reducedMotion);
  const soundEnabled = input.soundEnabled !== false;
  const responses = [];
  const suppressed = [];

  for (const completion of accepted) {
    if (previous.has(completion.contractId)) {
      suppressed.push({ contractId: completion.contractId, reason: "already-acknowledged" });
      continue;
    }

    responses.push(Object.freeze({
      id: `response:${completion.contractId}`,
      contractId: completion.contractId,
      acknowledgementKey: completion.acknowledgementKey,
      soundHookId: soundEnabled ? completion.soundHookId : null,
      motion: reducedMotion ? "none" : "subtle",
      atmosphere: atmosphereFor(completion.contractId),
    }));
  }

  responses.sort(compareContractId);
  suppressed.sort(compareContractId);
  const visible = responses.slice(-MAX_RESPONSES);
  const acknowledgedIds = [...previous, ...visible.map((entry) => entry.contractId)].sort();

  return Object.freeze({
    responses: Object.freeze(visible),
    acknowledgementState: Object.freeze({
      acknowledgedContractIds: Object.freeze(acknowledgedIds),
    }),
    telemetry: Object.freeze({
      candidateCount: accepted.length,
      emittedIds: Object.freeze(visible.map((entry) => entry.contractId).slice(0, MAX_TELEMETRY_IDS)),
      suppressedIds: Object.freeze(suppressed.map((entry) => entry.contractId).slice(0, MAX_TELEMETRY_IDS)),
      latestSuppressionReason: suppressed.at(-1)?.reason ?? null,
      reducedMotion,
      soundEnabled,
    }),
  });
}

function normalizeAccepted(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const contractId = stableString(item.contractId);
    const acknowledgementKey = stableString(item.acknowledgementKey);
    if (!contractId || !acknowledgementKey || byId.has(contractId)) continue;
    byId.set(contractId, Object.freeze({
      contractId,
      acknowledgementKey,
      soundHookId: stableString(item.soundHookId),
    }));
  }

  return [...byId.values()].sort(compareContractId);
}

function atmosphereFor(contractId) {
  if (contractId === "high-passage") return "mist-thins";
  if (contractId === "three-stone-chain") return "stones-answer";
  if (contractId === "listening-pool") return "water-listens";
  return "quiet-recognition";
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stableString).filter(Boolean))];
}

function stableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareContractId(left, right) {
  return left.contractId.localeCompare(right.contractId);
}
