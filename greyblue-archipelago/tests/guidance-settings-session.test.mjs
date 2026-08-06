import assert from "node:assert/strict";
import test from "node:test";
import { createGuidanceSettingsSession } from "../src/interface/guidance-settings-session.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    read(key) { return values.get(key); },
  };
}

test("hydrates persisted settings and exposes bounded controls", () => {
  const storage = memoryStorage({
    "greyblue.guidance": JSON.stringify({ verbosity: "minimal", reducedMotion: true, soundEnabled: false }),
  });
  const session = createGuidanceSettingsSession({ storage });
  const snapshot = session.snapshot();
  assert.deepEqual(snapshot.settings, { verbosity: "minimal", reducedMotion: true, soundEnabled: false });
  assert.equal(snapshot.controls.verbosity.value, "minimal");
  assert.deepEqual(snapshot.controls.verbosity.options, ["off", "minimal", "standard"]);
});

test("dispatch persists changed settings and emits one announcement", () => {
  const storage = memoryStorage();
  const announcements = [];
  const session = createGuidanceSettingsSession({ storage, announce: (item) => announcements.push(item) });
  const result = session.dispatch({ type: "toggle-reduced-motion" });
  assert.equal(result.changed, true);
  assert.equal(result.persisted, true);
  assert.equal(result.announced, true);
  assert.equal(announcements.length, 1);
  assert.deepEqual(JSON.parse(storage.read("greyblue.guidance")), result.settings);
});

test("unchanged action causes no persistence or announcement churn", () => {
  let writes = 0;
  const storage = { getItem: () => null, setItem: () => { writes += 1; } };
  const announcements = [];
  const session = createGuidanceSettingsSession({ storage, announce: (item) => announcements.push(item) });
  const result = session.dispatch({ type: "set-verbosity", value: "standard" });
  assert.equal(result.changed, false);
  assert.equal(result.persisted, false);
  assert.equal(result.announced, false);
  assert.equal(writes, 0);
  assert.equal(announcements.length, 0);
});

test("duplicate announcement ids are suppressed across dispatches", () => {
  const announcements = [];
  const session = createGuidanceSettingsSession({ storage: memoryStorage(), announce: (item) => announcements.push(item) });
  session.dispatch({ type: "toggle-sound" });
  session.dispatch({ type: "toggle-sound" });
  session.dispatch({ type: "toggle-sound" });
  assert.equal(announcements.length, 2);
  assert.equal(announcements[0].id, "guidance-sound-off");
  assert.equal(announcements[1].id, "guidance-sound-on");
});

test("malformed persisted JSON recovers to defaults", () => {
  const session = createGuidanceSettingsSession({ storage: memoryStorage({ "greyblue.guidance": "{" }) });
  assert.deepEqual(session.snapshot().settings, { verbosity: "standard", reducedMotion: false, soundEnabled: true });
});

test("missing storage recovers through bounded memory storage", () => {
  const session = createGuidanceSettingsSession();
  assert.equal(session.snapshot().storageRecovered, true);
  const result = session.dispatch({ type: "set-verbosity", value: "minimal" });
  assert.equal(result.persisted, true);
  assert.equal(result.settings.verbosity, "minimal");
});

test("storage failures do not block settings changes", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("quota"); },
  };
  const session = createGuidanceSettingsSession({ storage });
  const result = session.dispatch({ type: "toggle-sound" });
  assert.equal(result.settings.soundEnabled, false);
  assert.equal(result.persisted, false);
  assert.equal(result.telemetry.persistenceError, "quota");
});

test("announcement failures remain bounded and non-fatal", () => {
  const session = createGuidanceSettingsSession({
    storage: memoryStorage(),
    announce() { throw new Error("detached live region"); },
  });
  const result = session.dispatch({ type: "toggle-reduced-motion" });
  assert.equal(result.changed, true);
  assert.equal(result.announced, false);
});

test("outputs are immutable and JSON-safe", () => {
  const session = createGuidanceSettingsSession({ storage: memoryStorage() });
  const result = session.dispatch({ type: "cycle-verbosity" });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.settings), true);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.throws(() => { result.settings.verbosity = "off"; }, TypeError);
});
