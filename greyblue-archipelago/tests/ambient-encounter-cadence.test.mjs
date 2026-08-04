import assert from "node:assert/strict";
import test from "node:test";

import { planAmbientEncounter } from "../src/content/ambient-encounter-cadence.js";

const candidates = [
  {
    id: "mist-ribbon",
    presentationKey: "ambient.mist-ribbon",
    atmosphereHookId: "mist.ribbon",
    soundHookId: "wind.low",
    regionIds: ["north-reach"],
    requiredFlightModes: ["glide"],
    minimumAltitude: 40,
    maximumAltitude: 400,
    priority: 2,
    durationMs: 7000,
  },
  {
    id: "stone-echo",
    presentationKey: "ambient.stone-echo",
    atmosphereHookId: "stone.echo",
    soundHookId: "stone.chime",
    regionIds: ["north-reach"],
    requiredFlightModes: ["glide"],
    minimumAltitude: 20,
    maximumAltitude: 300,
    priority: 1,
  },
];

const context = { regionId: "north-reach", flightMode: "glide", altitude: 120 };

test("selects a deterministic eligible encounter", () => {
  const first = planAmbientEncounter({ nowMs: 100000, seed: "isle-7", candidates, context });
  const second = planAmbientEncounter({ nowMs: 100000, seed: "isle-7", candidates, context });

  assert.deepEqual(first, second);
  assert.ok(first.encounter);
  assert.equal(first.telemetry.reason, "selected");
  assert.equal(first.encounter.regionId, "north-reach");
  assert.deepEqual(first.state.recentEncounterIds, [first.encounter.id]);
});

test("suppresses encounters during the bounded cooldown", () => {
  const output = planAmbientEncounter({
    nowMs: 20000,
    lastEncounterAtMs: 10000,
    minimumGapMs: 30000,
    candidates,
    context,
  });

  assert.equal(output.encounter, null);
  assert.equal(output.telemetry.reason, "cooldown");
  assert.equal(output.telemetry.cooldownRemainingMs, 20000);
});

test("does not repeat recently emitted encounters", () => {
  const output = planAmbientEncounter({
    nowMs: 100000,
    seed: "isle-7",
    candidates,
    context,
    recentEncounterIds: ["mist-ribbon", "stone-echo"],
  });

  assert.equal(output.encounter, null);
  assert.equal(output.telemetry.reason, "no-eligible-candidate");
});

test("enforces region, flight-mode, and altitude eligibility", () => {
  const output = planAmbientEncounter({
    nowMs: 100000,
    candidates,
    context: { regionId: "south-shoal", flightMode: "landed", altitude: 0 },
  });

  assert.equal(output.encounter, null);
  assert.equal(output.telemetry.eligibleCount, 0);
});

test("preserves semantic parity for reduced motion and sound-off", () => {
  const output = planAmbientEncounter({
    nowMs: 100000,
    seed: "isle-7",
    candidates,
    context,
    reducedMotion: true,
    soundEnabled: false,
  });

  assert.ok(output.encounter);
  assert.equal(output.encounter.motion, "none");
  assert.equal(output.encounter.soundHookId, null);
  assert.ok(output.encounter.presentationKey);
  assert.ok(output.encounter.atmosphereHookId);
});

test("normalizes malformed candidates and keeps output JSON-safe", () => {
  const output = planAmbientEncounter({
    nowMs: Number.NaN,
    candidates: [null, {}, { id: "broken" }, { id: "valid", presentationKey: "ambient.valid", durationMs: Infinity }],
    context: null,
  });

  assert.ok(output.encounter);
  assert.equal(output.encounter.id, "valid");
  assert.equal(output.encounter.durationMs, 6000);
  assert.doesNotThrow(() => JSON.stringify(output));
});

test("does not mutate caller-owned candidates, context, or history", () => {
  const frozenCandidates = Object.freeze(candidates.map((entry) => Object.freeze({ ...entry })));
  const frozenContext = Object.freeze({ ...context });
  const history = Object.freeze(["older-event"]);

  planAmbientEncounter({
    nowMs: 100000,
    candidates: frozenCandidates,
    context: frozenContext,
    recentEncounterIds: history,
  });

  assert.deepEqual(frozenCandidates, candidates);
  assert.deepEqual(frozenContext, context);
  assert.deepEqual(history, ["older-event"]);
});

test("bounds retained encounter history", () => {
  const history = Array.from({ length: 20 }, (_, index) => `event-${index}`);
  const output = planAmbientEncounter({
    nowMs: 100000,
    candidates: [{ id: "new-event", presentationKey: "ambient.new" }],
    context,
    recentEncounterIds: history,
  });

  assert.equal(output.state.recentEncounterIds.length, 8);
  assert.equal(output.state.recentEncounterIds.at(-1), "new-event");
});
