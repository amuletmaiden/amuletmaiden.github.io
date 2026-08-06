import assert from "node:assert/strict";
import test from "node:test";
import {
  createFlightTransitionState,
  stepFlightTransition,
} from "../src/flight/transition-profile.js";

function settle(state, sample, seconds = 0.25) {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
    current = stepFlightTransition(current, sample, 0.05).state;
  }
  return current;
}

test("ground launch enters takeoff immediately and preserves a useful throttle floor", () => {
  const result = stepFlightTransition(createFlightTransitionState(), {
    airborne: true,
    heightAboveSurface: 1,
    airspeed: 4,
    throttle: 0.8,
    verticalSpeed: 2,
    stallPressure: 0,
  }, 0.016);
  assert.equal(result.state.mode, "takeoff");
  assert.ok(result.profile.throttleFloor >= 0.4);
  assert.ok(result.profile.pitchAssist > 0);
});

test("takeoff does not snap into powered flight before exit speed", () => {
  const state = createFlightTransitionState({ mode: "takeoff" });
  const result = stepFlightTransition(state, {
    airborne: true,
    heightAboveSurface: 5,
    airspeed: 10,
    throttle: 0.8,
    verticalSpeed: 2,
    stallPressure: 0,
  }, 0.05);
  assert.equal(result.state.mode, "takeoff");
});

test("sustained low throttle at useful speed transitions into glide", () => {
  const powered = createFlightTransitionState({ mode: "powered" });
  const result = settle(powered, {
    airborne: true,
    heightAboveSurface: 30,
    airspeed: 20,
    throttle: 0.05,
    verticalSpeed: -2,
    stallPressure: 0.1,
  });
  assert.equal(result.mode, "glide");
  const profile = stepFlightTransition(result, {
    airborne: true,
    heightAboveSurface: 30,
    airspeed: 20,
    throttle: 0.05,
    verticalSpeed: -4,
    stallPressure: 0.1,
  }, 0.05).profile;
  assert.ok(profile.dragScale < 1);
  assert.ok(profile.pitchAssist > 0);
});

test("glide hysteresis rejects brief throttle noise", () => {
  const state = createFlightTransitionState({ mode: "glide" });
  const result = stepFlightTransition(state, {
    airborne: true,
    heightAboveSurface: 25,
    airspeed: 19,
    throttle: 0.24,
    verticalSpeed: -1,
    stallPressure: 0.05,
  }, 0.05);
  assert.equal(result.state.mode, "glide");
});

test("landing request enters flare near the surface without forcing recovery", () => {
  const powered = createFlightTransitionState({ mode: "powered" });
  const result = settle(powered, {
    airborne: true,
    landingRequested: true,
    heightAboveSurface: 5,
    airspeed: 12,
    throttle: -0.2,
    verticalSpeed: -2,
    stallPressure: 0.3,
  });
  assert.equal(result.mode, "flare");
  const profile = stepFlightTransition(result, {
    airborne: true,
    landingRequested: true,
    heightAboveSurface: 4,
    airspeed: 11,
    throttle: -0.2,
    verticalSpeed: -2,
    stallPressure: 0.3,
  }, 0.05).profile;
  assert.equal(profile.throttleFloor, 0);
  assert.ok(profile.dragScale > 1);
});

test("slow low flare settles into touchdown", () => {
  const result = settle(createFlightTransitionState({ mode: "flare" }), {
    airborne: true,
    landingRequested: true,
    heightAboveSurface: 0.7,
    airspeed: 6,
    throttle: -0.5,
    verticalSpeed: -0.6,
    stallPressure: 0.2,
  });
  assert.equal(result.mode, "touchdown");
});

test("stall pressure engages recovery immediately and releases hysteretically", () => {
  const entered = stepFlightTransition(createFlightTransitionState({ mode: "powered" }), {
    airborne: true,
    heightAboveSurface: 20,
    airspeed: 6,
    throttle: 0,
    verticalSpeed: -8,
    stallPressure: 0.8,
  }, 0.016);
  assert.equal(entered.state.mode, "recovery");
  assert.ok(entered.profile.throttleFloor > 0);

  const held = stepFlightTransition(entered.state, {
    airborne: true,
    heightAboveSurface: 18,
    airspeed: 11,
    throttle: 0.5,
    verticalSpeed: -2,
    stallPressure: 0.4,
  }, 0.05);
  assert.equal(held.state.mode, "recovery");

  const released = settle(held.state, {
    airborne: true,
    heightAboveSurface: 18,
    airspeed: 16,
    throttle: 0.6,
    verticalSpeed: 1,
    stallPressure: 0.1,
  });
  assert.equal(released.mode, "powered");
});

test("ground contact is immediate and output is immutable JSON-safe", () => {
  const result = stepFlightTransition(createFlightTransitionState({ mode: "touchdown" }), {
    airborne: false,
    heightAboveSurface: 0,
    airspeed: 0,
    throttle: 0,
    verticalSpeed: 0,
    stallPressure: 0,
  }, 0.016);
  assert.equal(result.state.mode, "grounded");
  assert.ok(Object.isFrozen(result));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("malformed samples recover to finite bounded output without mutating callers", () => {
  const sample = Object.freeze({
    airborne: true,
    heightAboveSurface: Number.NaN,
    airspeed: Infinity,
    throttle: "bad",
    verticalSpeed: undefined,
    stallPressure: -9,
  });
  const before = JSON.stringify(sample);
  const result = stepFlightTransition({}, sample, Infinity, {
    stallEnter: Number.NaN,
    transitionHoldSeconds: -1,
  });
  assert.equal(JSON.stringify(sample), before);
  assert.equal(result.telemetry.malformedFallback, true);
  for (const value of Object.values(result.profile)) assert.ok(Number.isFinite(value));
  assert.doesNotThrow(() => JSON.stringify(result));
});
