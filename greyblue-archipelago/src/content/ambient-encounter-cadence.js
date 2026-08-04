const MAX_RECENT_IDS = 8;
const MAX_CANDIDATES = 32;

export function planAmbientEncounter(input = {}) {
  const nowMs = finiteNumber(input.nowMs, 0);
  const lastEncounterAtMs = finiteNumber(input.lastEncounterAtMs, Number.NEGATIVE_INFINITY);
  const minimumGapMs = Math.max(0, finiteNumber(input.minimumGapMs, 45000));
  const recentIds = uniqueStrings(input.recentEncounterIds).slice(-MAX_RECENT_IDS);
  const recentSet = new Set(recentIds);
  const reducedMotion = Boolean(input.reducedMotion);
  const soundEnabled = input.soundEnabled !== false;
  const candidates = normalizeCandidates(input.candidates).slice(0, MAX_CANDIDATES);
  const context = normalizeContext(input.context);
  const cooldownRemainingMs = Math.max(0, lastEncounterAtMs + minimumGapMs - nowMs);

  if (cooldownRemainingMs > 0) {
    return result(null, recentIds, {
      reason: "cooldown",
      cooldownRemainingMs,
      consideredCount: candidates.length,
      eligibleCount: 0,
      reducedMotion,
      soundEnabled,
    });
  }

  const eligible = candidates.filter((candidate) => isEligible(candidate, context, recentSet));
  if (eligible.length === 0) {
    return result(null, recentIds, {
      reason: candidates.length === 0 ? "no-candidates" : "no-eligible-candidate",
      cooldownRemainingMs: 0,
      consideredCount: candidates.length,
      eligibleCount: 0,
      reducedMotion,
      soundEnabled,
    });
  }

  eligible.sort(compareCandidate);
  const selected = eligible[deterministicIndex(input.seed, context.regionId, eligible.length)];
  const encounter = Object.freeze({
    id: selected.id,
    presentationKey: selected.presentationKey,
    atmosphereHookId: selected.atmosphereHookId,
    soundHookId: soundEnabled ? selected.soundHookId : null,
    motion: reducedMotion ? "none" : selected.motion,
    durationMs: selected.durationMs,
    regionId: context.regionId,
  });
  const nextRecentIds = [...recentIds.filter((id) => id !== selected.id), selected.id].slice(-MAX_RECENT_IDS);

  return result(encounter, nextRecentIds, {
    reason: "selected",
    cooldownRemainingMs: 0,
    consideredCount: candidates.length,
    eligibleCount: eligible.length,
    reducedMotion,
    soundEnabled,
  });
}

function result(encounter, recentEncounterIds, telemetry) {
  return Object.freeze({
    encounter,
    state: Object.freeze({
      recentEncounterIds: Object.freeze([...recentEncounterIds]),
    }),
    telemetry: Object.freeze({ ...telemetry }),
  });
}

function normalizeCandidates(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = stableString(item.id);
    const presentationKey = stableString(item.presentationKey);
    if (!id || !presentationKey || byId.has(id)) continue;

    byId.set(id, Object.freeze({
      id,
      presentationKey,
      atmosphereHookId: stableString(item.atmosphereHookId),
      soundHookId: stableString(item.soundHookId),
      motion: stableString(item.motion) ?? "subtle",
      durationMs: clamp(finiteNumber(item.durationMs, 6000), 1000, 20000),
      priority: clamp(finiteNumber(item.priority, 0), -100, 100),
      regionIds: Object.freeze(uniqueStrings(item.regionIds)),
      requiredFlightModes: Object.freeze(uniqueStrings(item.requiredFlightModes)),
      minimumAltitude: finiteNumber(item.minimumAltitude, Number.NEGATIVE_INFINITY),
      maximumAltitude: finiteNumber(item.maximumAltitude, Number.POSITIVE_INFINITY),
    }));
  }

  return [...byId.values()];
}

function normalizeContext(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    regionId: stableString(source.regionId),
    flightMode: stableString(source.flightMode),
    altitude: finiteNumber(source.altitude, 0),
  });
}

function isEligible(candidate, context, recentSet) {
  if (recentSet.has(candidate.id)) return false;
  if (candidate.regionIds.length > 0 && !candidate.regionIds.includes(context.regionId)) return false;
  if (candidate.requiredFlightModes.length > 0 && !candidate.requiredFlightModes.includes(context.flightMode)) return false;
  return context.altitude >= candidate.minimumAltitude && context.altitude <= candidate.maximumAltitude;
}

function compareCandidate(left, right) {
  return right.priority - left.priority || left.id.localeCompare(right.id);
}

function deterministicIndex(seed, regionId, length) {
  const source = `${stableString(seed) ?? "greyblue"}:${regionId ?? "unknown"}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stableString).filter(Boolean))];
}

function stableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
