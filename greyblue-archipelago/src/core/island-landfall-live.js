import { deriveIslandLandfall } from "./island-landfall.js";

const INACTIVE = Object.freeze({ completed: false, newLandfall: false });

function safeMessage(islandName) {
  return islandName ? `Landfall recorded: ${islandName}.` : "Landfall recorded.";
}

export function applyIslandLandfall({
  collision = null,
  position = null,
  islands = [],
  discoveredIslandIds = [],
  exploration = null,
  persist = null,
  announce = null,
} = {}) {
  const events = Array.isArray(exploration?.events) ? exploration.events : [];
  const result = deriveIslandLandfall({
    collision,
    position,
    islands,
    discoveredIslandIds,
    explorationEvents: events,
  });

  if (!result.state.newLandfall
    || !result.event
    || !Array.isArray(exploration?.events)
    || typeof persist !== "function") {
    return Object.freeze({ state: result.state || INACTIVE, event: null, message: null });
  }

  const event = Object.freeze({ ...result.event });
  exploration.events.push(event);
  persist();
  const message = safeMessage(result.islandName);
  if (typeof announce === "function") announce(message);

  return Object.freeze({ state: result.state, event, message });
}
