const INTENTIONS = Object.freeze([
  ['full-column', 'fullColumnWeather', {
    rise: 'Carry the climb upward.',
    clear: 'Keep the whole column unbroken.',
    complete: 'The weather run is complete.',
  }],
  ['ridge-to-cloud', 'ridgeToCloudAscent', {
    depart: 'Carry the ridge line outward.',
    climb: 'Take the ridge into the higher air.',
    clear: 'Break cleanly into the open sky.',
  }],
  ['homeward-roost', 'roostHomewardFlight', {
    depart: 'Leave the remembered shelf behind.',
    homeward: 'Carry the flight back toward shelter.',
    settle: 'Bring the return down cleanly.',
  }],
  ['known-voyage', 'knownVoyageIntention', {
    depart: 'Take wing for the voyage you chose.',
    underway: 'Read the archipelago for yourself.',
  }],
  ['high-air-landfall', 'highAirLandfall', {
    descent: 'Descend into the arrival.',
    approach: 'Carry the approach forward.',
    settle: 'Find a clean landing.',
  }],
  ['high-air-crossing', 'highAirCrossing', {
    depart: 'Commit to the high crossing.',
    cross: 'Stay high and keep moving.',
    arrive: 'The far air is opening.',
  }],
  ['mystery-listening', 'mysteryListeningPass', {
    depart: 'Give the place some distance.',
    return: 'Turn back through the same air.',
    listen: 'Listen on the return.',
  }],
  ['mystery-search', 'regionalMysterySearchFlight', {
    trace: 'Follow the quiet trace.',
    approach: 'Keep closing naturally.',
    arrive: 'The trace is near.',
  }],
  ['survey-sortie', 'surveyToLandingSortie', {
    depart: 'Carry the survey outward.',
    return: 'Bring the circuit home.',
    settle: 'Finish on a clean touchdown.',
  }],
  ['island-survey', 'discoveredIslandSurvey', {
    acquire: 'Settle into a broad circuit.',
    circle: 'Keep the island turning beneath you.',
    complete: 'The aerial survey is complete.',
  }],
  ['cloudbreak', 'cloudbreakRun', {
    climb: 'Climb through the cloudline.',
    cruise: 'Use the clear air while it lasts.',
    return: 'Drop back through the mist.',
  }],
  ['deep-mist', 'deepMistRun', {
    descend: 'Sink into the lower mist.',
    thread: 'Hold a fast line through the grey.',
    climb: 'Climb back toward clearer air.',
  }],
  ['island-hop', 'islandHopRun', {
    depart: 'Leave the shelf cleanly.',
    cruise: 'Carry the hop across open air.',
    settle: 'Settle the next landing.',
  }],
  ['touch-and-go', 'touchAndGoLaunch', {
    settle: 'Touch down cleanly.',
    launch: 'Lift away without breaking rhythm.',
    complete: 'The touch-and-go is complete.',
  }],
]);

function safeState(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    available: value.available === true,
    active: value.active === true,
    completed: value.completed === true,
    phase: typeof value.phase === 'string' ? value.phase : '',
  };
}

export function deriveFlightIntention({ strongSurface = false, states = {} } = {}) {
  if (strongSurface === true) {
    return Object.freeze({ visible: false, kind: 'none', phase: 'idle', text: '' });
  }

  for (const [kind, key, copy] of INTENTIONS) {
    const state = safeState(states?.[key]);
    if (!state || state.completed || state.active !== true || state.available !== true) continue;
    const text = copy[state.phase];
    if (!text) continue;
    return Object.freeze({ visible: true, kind, phase: state.phase, text });
  }

  return Object.freeze({ visible: false, kind: 'none', phase: 'idle', text: '' });
}
