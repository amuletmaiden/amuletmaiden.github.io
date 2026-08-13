import assert from "node:assert/strict";
import test from "node:test";

import { LiveCrosswindRun } from "../src/core/crosswind-run-live.js";

function state(overrides = {}) {
  return {
    ready: true,
    paused: false,
    position: { x: 0, z: 0 },
    flight: {
      airborne: true,
      landingRequested: false,
      speed: 36,
      stallFactor: 0,
    },
    collision: {
      grounded: false,
      requiresRecovery: false,
    },
    routeChoice: null,
    ...overrides,
  };
}

const crossLeft = Object.freeze({ active: true, direction: "cross-left" });
const calm = Object.freeze({ active: false, direction: null });

test("live crosswind run completes once after genuine spaced travel and clean release", () => {
  const live = new LiveCrosswindRun({ requiredTravel: 80, minStep: 4, maxStep: 40 });
  let s = state();

  assert.equal(live.update({ state: s, readback: crossLeft }).state.phase, "catch");
  for (let x = 20; x <= 80; x += 20) {
    s = { ...s, position: { x, z: 0 } };
    live.update({ state: s, readback: crossLeft });
  }

  const completion = live.update({ state: s, readback: calm });
  assert.deepEqual(Object.keys(completion.state).sort(), ["active", "available", "completed", "phase"]);
  assert.equal(completion.state.completed, true);
  assert.equal(completion.state.phase, "release");
  assert.equal(typeof completion.message, "string");

  const next = live.update({ state: s, readback: calm });
  assert.equal(next.state.completed, false);
  assert.equal(next.message, null);
});

test("live crosswind run fails closed for interruption and unstable flight", () => {
  const cases = [
    { paused: true },
    { flight: { airborne: true, landingRequested: true, speed: 36, stallFactor: 0 } },
    { flight: { airborne: true, landingRequested: false, speed: 12, stallFactor: 0 } },
    { flight: { airborne: true, landingRequested: false, speed: 36, stallFactor: 0.7 } },
    { collision: { grounded: true, requiresRecovery: false } },
    { collision: { grounded: false, requiresRecovery: true } },
    { routeChoice: { reason: "active-crossing" } },
  ];

  for (const overrides of cases) {
    const live = new LiveCrosswindRun({ requiredTravel: 80 });
    const result = live.update({ state: state(overrides), readback: crossLeft });
    assert.equal(result.state.active, false);
    assert.equal(result.state.completed, false);
    assert.equal(result.message, null);
  }
});

test("live crosswind run contains malformed position and does not mutate caller state", () => {
  const live = new LiveCrosswindRun({ requiredTravel: 80 });
  const input = state({ position: { x: Number.NaN, z: 0 } });
  const beforeFlight = { ...input.flight };
  const beforeCollision = { ...input.collision };

  const result = live.update({ state: input, readback: crossLeft });
  assert.equal(result.state.active, false);
  assert.equal(result.state.completed, false);
  assert.deepEqual(input.flight, beforeFlight);
  assert.deepEqual(input.collision, beforeCollision);
});
