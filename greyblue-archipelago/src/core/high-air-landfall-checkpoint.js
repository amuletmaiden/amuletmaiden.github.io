function boundedId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function finitePosition(position) {
  return Boolean(position)
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z);
}

export function createHighAirLandfallCheckpointState() {
  return Object.freeze({ consumed: false });
}

export function planHighAirLandfallCheckpoint({
  policyState = createHighAirLandfallCheckpointState(),
  eventDetail = null,
  runtimeState = null,
} = {}) {
  if (policyState?.consumed === true) {
    return Object.freeze({ shouldCheckpoint: false, nextPolicyState: policyState });
  }

  const truthfulCompletion = eventDetail?.event === 'completed'
    && eventDetail?.completed === true
    && eventDetail?.phase === 'settle';
  const validRuntime = runtimeState?.ready === true
    && runtimeState?.paused !== true
    && runtimeState?.collision?.requiresRecovery !== true
    && runtimeState?.flight?.mode !== 'recovery'
    && runtimeState?.restorePublishing !== true
    && runtimeState?.explorationRestorePublishing !== true
    && Boolean(boundedId(runtimeState?.currentRegion?.id))
    && Array.isArray(runtimeState?.discovered)
    && finitePosition(runtimeState?.position);

  if (!truthfulCompletion || !validRuntime) {
    return Object.freeze({ shouldCheckpoint: false, nextPolicyState: policyState });
  }

  return Object.freeze({
    shouldCheckpoint: true,
    nextPolicyState: Object.freeze({ consumed: true }),
  });
}
