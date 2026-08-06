import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGuidanceSettings,
  planGuidancePresentation,
} from "../src/interface/guidance-settings-policy.js";

const guidance = Object.freeze({
  destination: Object.freeze({
    id: "listening-pool",
    bearingDegrees: 87,
    distanceBand: "near",
    phase: "approach",
    motion: "subtle",
    soundHookId: "pool-wind",
  }),
  announcement: Object.freeze({
    id: "approach:listening-pool",
    destinationId: "listening-pool",
    kind: "approach",
  }),
});

test("standard guidance exposes visual, announcement, and permitted sound hook", () => {
  const result = planGuidancePresentation({ guidance, nowMs: 5000 });
  assert.equal(result.visual.destinationId, "listening-pool");
  assert.equal(result.announcement.id, "approach:listening-pool");
  assert.equal(result.soundHookId, "pool-wind");
  assert.equal(result.telemetry.reason, "announced");
});

test("off suppresses all player-facing guidance while retaining bounded state", () => {
  const result = planGuidancePresentation({
    guidance,
    settings: { verbosity: "off" },
    previousPresentation: { lastAnnouncementId: "arrival:old", lastAnnouncementAtMs: 12 },
  });
  assert.equal(result.visual, null);
  assert.equal(result.announcement, null);
  assert.equal(result.soundHookId, null);
  assert.deepEqual(result.state, { lastAnnouncementId: "arrival:old", lastAnnouncementAtMs: 12 });
});

test("minimal preserves destination semantics but announces only arrival", () => {
  const approach = planGuidancePresentation({ guidance, settings: { verbosity: "minimal" }, nowMs: 10000 });
  assert.equal(approach.visual.detail, "minimal");
  assert.equal(approach.announcement, null);
  assert.equal(approach.telemetry.verbositySuppressed, true);

  const arrivalGuidance = {
    ...guidance,
    destination: { ...guidance.destination, phase: "arrived", distanceBand: "arrival" },
    announcement: { id: "arrival:listening-pool", destinationId: "listening-pool", kind: "arrived" },
  };
  const arrival = planGuidancePresentation({ guidance: arrivalGuidance, settings: { verbosity: "minimal" }, nowMs: 10000 });
  assert.equal(arrival.announcement.kind, "arrived");
});

test("reduced motion removes motion without changing semantic guidance", () => {
  const result = planGuidancePresentation({ guidance, settings: { reducedMotion: true }, nowMs: 5000 });
  assert.equal(result.visual.motion, "none");
  assert.equal(result.visual.destinationId, guidance.destination.id);
  assert.equal(result.announcement.destinationId, guidance.destination.id);
});

test("sound preference removes optional sound only", () => {
  const result = planGuidancePresentation({ guidance, settings: { soundEnabled: false }, nowMs: 5000 });
  assert.equal(result.soundHookId, null);
  assert.ok(result.visual);
  assert.ok(result.announcement);
});

test("duplicate and cadence suppression prevent live-region churn", () => {
  const duplicate = planGuidancePresentation({
    guidance,
    nowMs: 9000,
    previousPresentation: { lastAnnouncementId: guidance.announcement.id, lastAnnouncementAtMs: 1000 },
  });
  assert.equal(duplicate.announcement, null);
  assert.equal(duplicate.telemetry.duplicateSuppressed, true);

  const cadence = planGuidancePresentation({
    guidance,
    nowMs: 3000,
    previousPresentation: { lastAnnouncementId: "other", lastAnnouncementAtMs: 1000 },
  });
  assert.equal(cadence.announcement, null);
  assert.equal(cadence.telemetry.cadenceSuppressed, true);
});

test("malformed settings recover deterministically", () => {
  const settings = normalizeGuidanceSettings({ verbosity: "maximum", reducedMotion: 1, soundEnabled: 0 });
  assert.deepEqual(settings, {
    verbosity: "standard",
    reducedMotion: true,
    soundEnabled: true,
    recovered: true,
  });
});

test("missing destination produces bounded fallback", () => {
  const result = planGuidancePresentation({ guidance: {}, nowMs: Number.NaN });
  assert.equal(result.visual, null);
  assert.equal(result.telemetry.reason, "no-destination");
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("inputs remain immutable and output is deeply frozen", () => {
  const settings = { verbosity: "standard", reducedMotion: false, soundEnabled: true };
  const before = JSON.stringify({ guidance, settings });
  const result = planGuidancePresentation({ guidance, settings, nowMs: 5000 });
  assert.equal(JSON.stringify({ guidance, settings }), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.visual), true);
  assert.equal(Object.isFrozen(result.telemetry), true);
});
