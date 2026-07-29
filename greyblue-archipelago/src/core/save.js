const SAVE_KEY = "greyblue-archipelago-save-v1";

export function saveGame(state, storage = localStorage) {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    seed: state.seed,
    position: state.position,
    discovered: [...(state.discovered || [])],
    settings: state.settings || {},
  };
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function loadGame(storage = localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSave(storage = localStorage) {
  storage.removeItem(SAVE_KEY);
}

export function safeRespawn(state, spawn = { x: 0, y: 120, z: 0 }) {
  return {
    ...state,
    position: { ...spawn },
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    landingRequested: false,
  };
}
