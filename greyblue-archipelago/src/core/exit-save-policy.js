const EXIT_REASONS = new Set(['pagehide', 'beforeunload', 'hidden']);

function finitePosition(position) {
  return Boolean(position)
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z);
}

export function createExitSavePolicyState() {
  return Object.freeze({ exitSaved: false });
}

export function rearmExitSavePolicyState(policyState = createExitSavePolicyState()) {
  return policyState?.exitSaved === true
    ? createExitSavePolicyState()
    : policyState;
}

export function truthfulExitSaveState(runtimeState) {
  return Boolean(runtimeState)
    && runtimeState.ready === true
    && runtimeState.paused !== true
    && runtimeState.collision?.requiresRecovery !== true
    && Boolean(finitePosition(runtimeState.position));
}

export function planPersistenceFlush({
  policyState = createExitSavePolicyState(),
  reason,
  lifecycleDirty = false,
  runtimeState = null,
} = {}) {
  const exitReason = EXIT_REASONS.has(reason);
  const dirty = lifecycleDirty === true;
  const eligibleExit = exitReason
    && policyState?.exitSaved !== true
    && truthfulExitSaveState(runtimeState);
  const shouldFlush = dirty || eligibleExit;
  const nextPolicyState = Object.freeze({
    exitSaved: policyState?.exitSaved === true || (eligibleExit && shouldFlush),
  });
  return Object.freeze({
    shouldFlush,
    forcedExitSave: eligibleExit && !dirty,
    nextPolicyState,
  });
}
