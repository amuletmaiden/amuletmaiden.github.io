function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map(cleanId).filter(Boolean));
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(cleanId).filter(Boolean));
}

function knownLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function inactive(available = false) {
  return Object.freeze({
    available,
    active: false,
    phase: available ? 'ready' : 'unavailable',
    nextLabel: null,
    completed: false,
    circuit: null,
  });
}

function eligibleKnownLandmarks({ world, regionId, discoveredIslandIds, investigatedLandmarkIds }) {
  const discovered = idSet(discoveredIslandIds);
  const investigated = idSet(investigatedLandmarkIds);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  return islands
    .filter((island) => cleanId(island?.regionId) === regionId)
    .map((island) => {
      const islandId = cleanId(island?.id);
      const landmarkId = cleanId(island?.landmarkRecord?.id);
      const label = knownLabel(island?.landmarkRecord?.title) ?? knownLabel(island?.name);
      if (!islandId || !landmarkId || !label) return null;
      if (!discovered.has(islandId) || !investigated.has(landmarkId)) return null;
      return Object.freeze({ islandId, landmarkId, label });
    })
    .filter(Boolean)
    .sort((a, b) => a.landmarkId.localeCompare(b.landmarkId));
}

function chooseCircuit(eligible, regionId) {
  if (eligible.length < 3) return null;
  const offset = stableHash(regionId) % eligible.length;
  const ordered = [];
  for (let index = 0; index < eligible.length; index += 1) {
    ordered.push(eligible[(offset + index) % eligible.length]);
  }
  return Object.freeze(ordered.slice(0, 3).map((step) => Object.freeze({ ...step })));
}

function normalizeState(state, eligible) {
  if (!state?.active || !Array.isArray(state?.circuit) || state.circuit.length !== 3) return null;
  const known = new Map(eligible.map((step) => [step.landmarkId, step]));
  const circuit = [];
  for (const raw of state.circuit) {
    const landmarkId = cleanId(raw?.landmarkId);
    const candidate = landmarkId ? known.get(landmarkId) : null;
    if (!candidate || cleanId(raw?.islandId) !== candidate.islandId) return null;
    circuit.push(candidate);
  }
  if (new Set(circuit.map((step) => step.landmarkId)).size !== 3) return null;
  const stepIndex = Number.isInteger(state.stepIndex) ? state.stepIndex : -1;
  if (stepIndex < 0 || stepIndex > 2) return null;
  return Object.freeze({ active: true, circuit: Object.freeze(circuit), stepIndex });
}

export function stepKnownLandmarkTraversalCircuit({
  world,
  currentRegionId,
  discoveredIslandIds,
  investigatedLandmarkIds,
  startRequested = false,
  interactionRequested = false,
  encounterPresent = false,
  currentIslandId,
  currentLandmarkId,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
  state,
} = {}) {
  const regionId = cleanId(currentRegionId);
  if (!regionId || recoveryActive || crossingActive || restorePublishing) return inactive(false);

  const eligible = eligibleKnownLandmarks({
    world,
    regionId,
    discoveredIslandIds,
    investigatedLandmarkIds,
  });
  const available = eligible.length >= 3;
  if (!available) return inactive(false);

  let circuitState = normalizeState(state, eligible);
  if (!circuitState) {
    if (startRequested !== true) return inactive(true);
    const circuit = chooseCircuit(eligible, regionId);
    if (!circuit) return inactive(false);
    circuitState = Object.freeze({ active: true, circuit, stepIndex: 0 });
  }

  const expected = circuitState.circuit[circuitState.stepIndex];
  const exactPresence = encounterPresent === true
    && cleanId(currentIslandId) === expected.islandId
    && cleanId(currentLandmarkId) === expected.landmarkId;

  if (!exactPresence || interactionRequested !== true) {
    return Object.freeze({
      available: true,
      active: true,
      phase: 'seeking',
      nextLabel: expected.label,
      completed: false,
      circuit: circuitState,
    });
  }

  if (circuitState.stepIndex === circuitState.circuit.length - 1) {
    return Object.freeze({
      available: true,
      active: false,
      phase: 'completed',
      nextLabel: null,
      completed: true,
      circuit: null,
    });
  }

  const advanced = Object.freeze({
    active: true,
    circuit: circuitState.circuit,
    stepIndex: circuitState.stepIndex + 1,
  });
  const next = advanced.circuit[advanced.stepIndex];
  return Object.freeze({
    available: true,
    active: true,
    phase: 'advanced',
    nextLabel: next.label,
    completed: false,
    circuit: advanced,
  });
}

export function knownLandmarkTraversalCircuitPublicState(result) {
  const phase = result?.phase === 'ready' || result?.phase === 'seeking' || result?.phase === 'advanced' || result?.phase === 'completed'
    ? result.phase
    : result?.available ? 'ready' : 'unavailable';
  const active = Boolean(result?.active && (phase === 'seeking' || phase === 'advanced'));
  return Object.freeze({
    available: Boolean(result?.available),
    active,
    phase,
    nextLabel: active ? knownLabel(result?.nextLabel) : null,
    completed: Boolean(result?.completed && phase === 'completed'),
  });
}
