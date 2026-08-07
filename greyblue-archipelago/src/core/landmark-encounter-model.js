function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback;
}

export function createLandmarkEncounterState(initial = {}) {
  const visited = Array.isArray(initial.visitedIds)
    ? initial.visitedIds.filter((value) => typeof value === 'string' && value.trim()).slice(0, 256)
    : [];
  return Object.freeze({
    visitedIds: Object.freeze([...new Set(visited)]),
    activeId: typeof initial.activeId === 'string' ? initial.activeId : null,
    revealedId: typeof initial.revealedId === 'string' ? initial.revealedId : null,
  });
}

export function selectLandmarkEncounter({ world, position, altitude } = {}, state = createLandmarkEncounterState()) {
  const px = finite(position?.x);
  const pz = finite(position?.z);
  const y = finite(altitude, finite(position?.y));
  let best = null;

  for (const island of Array.isArray(world?.islands) ? world.islands : []) {
    const landmark = island?.landmarkRecord;
    const encounter = landmark?.encounter;
    if (!landmark || !encounter) continue;
    const distance = Math.hypot(px - finite(island.x), pz - finite(island.z));
    const triggerRadius = clamp(finite(encounter.triggerRadius, 180), 40, 600);
    if (distance > triggerRadius) continue;
    if (best && distance >= best.distance) continue;
    best = { island, landmark, encounter, distance, triggerRadius };
  }

  if (!best) {
    return Object.freeze({
      state: createLandmarkEncounterState({ ...state, activeId: null }),
      view: Object.freeze({ visible: false, available: false, visited: false, prompt: '', title: '', status: '', reveal: null }),
    });
  }

  const visited = state.visitedIds.includes(best.landmark.id);
  const altitudeReady = y >= finite(best.encounter.minimumAltitude, 0);
  const title = safeText(best.landmark.title, 'Unknown landmark');
  const encounterClass = safeText(best.encounter.class, 'threshold');
  const distance = Math.max(0, Math.round(best.distance));
  const minimumAltitude = Math.max(0, Math.round(finite(best.encounter.minimumAltitude, 0)));

  return Object.freeze({
    state: createLandmarkEncounterState({ ...state, activeId: best.landmark.id }),
    view: Object.freeze({
      visible: true,
      available: altitudeReady && !visited,
      visited,
      landmarkId: best.landmark.id,
      islandId: safeText(best.island.id),
      title,
      encounterClass,
      distance,
      minimumAltitude,
      prompt: visited ? 'Encounter remembered' : altitudeReady ? 'F · investigate' : `Climb to ${minimumAltitude}m to investigate`,
      status: `${distance}m · ${encounterClass}`,
      reveal: null,
      revealText: safeText(best.encounter.revealText, safeText(best.landmark.clue, 'The landmark gives no answer.')),
    }),
  });
}

export function activateLandmarkEncounter(state, view) {
  const previous = createLandmarkEncounterState(state);
  if (!view?.visible || !view?.available || !view?.landmarkId) {
    return Object.freeze({ state: previous, reveal: null, changed: false });
  }
  const visitedIds = [...previous.visitedIds, view.landmarkId];
  const next = createLandmarkEncounterState({ visitedIds, activeId: view.landmarkId, revealedId: view.landmarkId });
  return Object.freeze({
    state: next,
    reveal: Object.freeze({
      landmarkId: view.landmarkId,
      title: safeText(view.title, 'Landmark'),
      text: safeText(view.revealText, 'The landmark gives no answer.'),
    }),
    changed: true,
  });
}
