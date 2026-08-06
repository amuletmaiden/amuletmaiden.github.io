import assert from "node:assert/strict";
import test from "node:test";
import {
  describeGuidanceControls,
  reduceGuidanceSettings,
} from "../src/interface/guidance-settings-controls.js";

test("cycles guidance verbosity deterministically", () => {
  const forward = reduceGuidanceSettings({
    settings: { verbosity: "minimal" },
    action: { type: "cycle-verbosity", direction: "forward" },
  });
  assert.equal(forward.settings.verbosity, "standard");
  assert.equal(forward.changed, true);
  assert.equal(forward.persistence.value.verbosity, "standard");

  const wrapped = reduceGuidanceSettings({
    settings: { verbosity: "standard" },
    action: { type: "cycle-verbosity", direction: "forward" },
  });
  assert.equal(wrapped.settings.verbosity, "off");
});

test("cycles backward with bounded wraparound", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "off" },
    action: { type: "cycle-verbosity", direction: "backward" },
  });
  assert.equal(result.settings.verbosity, "standard");
});

test("sets verbosity and suppresses unchanged persistence churn", () => {
  const unchanged = reduceGuidanceSettings({
    settings: { verbosity: "minimal" },
    action: { type: "set-verbosity", value: "minimal" },
  });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.persistence, null);
  assert.equal(unchanged.announcement, null);
});

test("toggles reduced motion without changing semantics", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "standard", reducedMotion: false, soundEnabled: true },
    action: { type: "toggle-reduced-motion" },
  });
  assert.deepEqual(result.persistence.value, {
    verbosity: "standard",
    reducedMotion: true,
    soundEnabled: true,
  });
  assert.equal(result.announcement.id, "guidance-motion-reduced");
});

test("toggles sound independently of verbosity and motion", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "minimal", reducedMotion: true, soundEnabled: true },
    action: { type: "toggle-sound" },
  });
  assert.deepEqual(result.persistence.value, {
    verbosity: "minimal",
    reducedMotion: true,
    soundEnabled: false,
  });
  assert.equal(result.announcement.id, "guidance-sound-off");
});

test("recovers malformed set action to finite defaults", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "off" },
    action: { type: "set-verbosity", value: "maximum" },
  });
  assert.equal(result.settings.verbosity, "standard");
  assert.equal(result.telemetry.recoveredAction, true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("unsupported actions do not create state or announcement churn", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "minimal" },
    action: { type: "launch-fireworks" },
  });
  assert.equal(result.changed, false);
  assert.equal(result.persistence, null);
  assert.equal(result.announcement, null);
  assert.equal(result.telemetry.reason, "unsupported-action");
});

test("reset returns accessible defaults", () => {
  const result = reduceGuidanceSettings({
    settings: { verbosity: "off", reducedMotion: true, soundEnabled: false },
    action: { type: "reset" },
  });
  assert.deepEqual(result.persistence.value, {
    verbosity: "standard",
    reducedMotion: false,
    soundEnabled: true,
  });
});

test("control descriptors are immutable and bounded", () => {
  const controls = describeGuidanceControls({ verbosity: "minimal", reducedMotion: true, soundEnabled: false });
  assert.deepEqual(controls.verbosity.options, ["off", "minimal", "standard"]);
  assert.equal(controls.reducedMotion.value, true);
  assert.equal(controls.soundEnabled.value, false);
  assert.equal(Object.isFrozen(controls), true);
  assert.equal(Object.isFrozen(controls.verbosity.options), true);
});

test("does not mutate caller settings or action", () => {
  const settings = { verbosity: "minimal", reducedMotion: false, soundEnabled: true };
  const action = { type: "toggle-sound" };
  reduceGuidanceSettings({ settings, action });
  assert.deepEqual(settings, { verbosity: "minimal", reducedMotion: false, soundEnabled: true });
  assert.deepEqual(action, { type: "toggle-sound" });
});
