function boundedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

export function masteryFromChallengeEvent({ eventDetail, discoveredIslandIds, approachChallenge } = {}) {
  if (eventDetail?.kind !== 'succeeded') return null;
  const islandId = boundedId(eventDetail?.islandId);
  const corridorId = boundedId(eventDetail?.corridorId);
  if (!islandId || !corridorId) return null;

  const discovered = new Set(Array.isArray(discoveredIslandIds)
    ? discoveredIslandIds.map(boundedId).filter(Boolean)
    : []);
  if (!discovered.has(islandId)) return null;

  const activeIslandId = boundedId(approachChallenge?.islandId);
  const activeCorridorId = boundedId(approachChallenge?.corridorId);
  if (approachChallenge?.phase !== 'succeeded'
    || activeIslandId !== islandId
    || activeCorridorId !== corridorId) return null;

  return Object.freeze({ islandId, corridorId });
}
