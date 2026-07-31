import {
  restoreExplorationProgress,
  serializeExplorationProgress,
} from "./exploration-progress.js";

const EXPLORATION_SAVE_VERSION = 1;

/**
 * Restore the durable exploration ledger from any supported game-save shape.
 * Legacy saves without a ledger remain valid and begin with an empty ledger;
 * old discovered arrays are intentionally not reinterpreted as completed events.
 */
export function restoreExplorationFromGameSave(save = null) {
  const candidate = save && typeof save === "object" ? save.exploration : null;
  return restoreExplorationProgress(candidate);
}

/**
 * Produce the JSON-safe exploration field stored by the game save layer.
 * Transient indexes and presentation state are removed by the ledger contract.
 */
export function serializeExplorationForGameSave(progress = {}) {
  const serialized = serializeExplorationProgress(progress);
  return {
    version: EXPLORATION_SAVE_VERSION,
    events: serialized.events,
  };
}

/**
 * Return a save-state copy carrying only the canonical durable exploration data.
 * This keeps app integration explicit and prevents mutation of caller-owned state.
 */
export function attachExplorationToGameState(state = {}, progress = {}) {
  const source = state && typeof state === "object" ? state : {};
  return {
    ...source,
    exploration: serializeExplorationForGameSave(progress),
  };
}

/**
 * Migration telemetry is deliberately compact and contains no presentation data.
 */
export function explorationSaveMigrationTelemetry(save = null) {
  const hadExplorationField = Boolean(
    save && typeof save === "object" && Object.hasOwn(save, "exploration"),
  );
  const progress = restoreExplorationFromGameSave(save);
  return Object.freeze({
    hadExplorationField,
    restoredEventCount: progress.events.length,
    recoveredEmpty: !hadExplorationField || progress.events.length === 0,
  });
}
