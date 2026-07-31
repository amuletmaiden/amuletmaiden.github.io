import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const progressUrl = await importSource("../src/core/exploration-progress.js");
let adapterSource = await readFile(
  new URL("../src/core/exploration-save.js", import.meta.url),
  "utf8",
);
adapterSource = adapterSource.replace(
  '"./exploration-progress.js"',
  JSON.stringify(progressUrl),
);
const adapterUrl = `data:text/javascript;base64,${Buffer.from(adapterSource).toString("base64")}`;
const {
  restoreExplorationFromGameSave,
  serializeExplorationForGameSave,
  attachExplorationToGameState,
  explorationSaveMigrationTelemetry,
} = await import(adapterUrl);

const legacy = {
  version: 2,
  discovered: ["island:west"],
  discoveredRoutes: ["route:west-east"],
};
const legacyProgress = restoreExplorationFromGameSave(legacy);
assert.deepEqual(legacyProgress.events, []);
assert.equal(legacyProgress.keys.size, 0);
assert.deepEqual(explorationSaveMigrationTelemetry(legacy), {
  hadExplorationField: false,
  restoredEventCount: 0,
  recoveredEmpty: true,
});

const malformed = restoreExplorationFromGameSave({
  exploration: {
    version: 99,
    events: [
      null,
      { kind: "toast", id: "ignore" },
      { kind: "region-entered", id: " region:west ", occurredAt: 22.9 },
      { kind: "region-entered", id: "region:west", occurredAt: 44 },
    ],
  },
});
assert.equal(malformed.events.length, 1);
assert.equal(malformed.events[0].key, "region-entered:region:west");
assert.equal(malformed.events[0].occurredAt, 22);

const serialized = serializeExplorationForGameSave(malformed);
assert.equal(serialized.version, 1);
assert.equal(Array.isArray(serialized.events), true);
assert.equal(Object.hasOwn(serialized, "keys"), false);
assert.equal(Object.hasOwn(serialized, "lastEvent"), false);
assert.doesNotThrow(() => JSON.stringify(serialized));

const originalState = { seed: 1337, settings: { cameraDistance: 24 } };
const attached = attachExplorationToGameState(originalState, malformed);
assert.notEqual(attached, originalState);
assert.deepEqual(originalState, { seed: 1337, settings: { cameraDistance: 24 } });
assert.equal(attached.exploration.events.length, 1);

attached.exploration.events.push({ kind: "invalid" });
assert.equal(malformed.events.length, 1, "serialized save data cannot mutate runtime progress");

assert.deepEqual(explorationSaveMigrationTelemetry(attached), {
  hadExplorationField: true,
  restoredEventCount: 1,
  recoveredEmpty: false,
});

console.log("exploration save migration tests passed");
