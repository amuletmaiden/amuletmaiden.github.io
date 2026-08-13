import assert from "node:assert/strict";
import {
  deriveLiveRegionalAirCurrentReadback,
  regionalAirCurrentReadbackLabel,
  REGIONAL_AIR_CURRENT_READBACK_STABLE_SPEED,
} from "../src/core/regional-air-current-readback-live.js";

const stableFlight = Object.freeze({
  airborne: true,
  landingRequested: false,
  speed: 42,
  stallFactor: 0,
  yaw: 0,
});
const clearCollision = Object.freeze({ grounded: false, requiresRecovery: false });

const directions = [
  [{ x: 0, z: 3 }, "withwind", "tailwind"],
  [{ x: 0, z: -3 }, "headwind", "headwind"],
  [{ x: -3, z: 0 }, "cross-left", "crosswind left"],
  [{ x: 3, z: 0 }, "cross-right", "crosswind right"],
];

for (const [airCurrent, direction, label] of directions) {
  const state = deriveLiveRegionalAirCurrentReadback({
    airCurrent,
    flight: stableFlight,
    collision: clearCollision,
  });
  assert.deepEqual(state, { active: true, direction });
  assert.equal(regionalAirCurrentReadbackLabel(state), label);
  assert.deepEqual(Object.keys(state).sort(), ["active", "direction"]);
}

const suppressed = [
  { flight: { ...stableFlight, airborne: false } },
  { flight: { ...stableFlight, landingRequested: true } },
  { flight: { ...stableFlight, speed: REGIONAL_AIR_CURRENT_READBACK_STABLE_SPEED - 0.01 } },
  { flight: { ...stableFlight, stallFactor: 0.36 } },
  { flight: { ...stableFlight, yaw: Number.NaN } },
  { collision: { grounded: true, requiresRecovery: false } },
  { collision: { grounded: false, requiresRecovery: true } },
  { recovering: true },
];

for (const override of suppressed) {
  const state = deriveLiveRegionalAirCurrentReadback({
    airCurrent: { x: 3, z: 0 },
    flight: override.flight ?? stableFlight,
    collision: override.collision ?? clearCollision,
    recovering: override.recovering ?? false,
  });
  assert.deepEqual(state, { active: false, direction: null });
  assert.equal(regionalAirCurrentReadbackLabel(state), "");
}

const current = { x: 2.5, z: -1.25 };
const flight = { ...stableFlight };
const collision = { ...clearCollision };
const before = JSON.stringify({ current, flight, collision });
deriveLiveRegionalAirCurrentReadback({ airCurrent: current, flight, collision });
assert.equal(JSON.stringify({ current, flight, collision }), before, "live readback must be observational only");

console.log(JSON.stringify({
  status: "pass",
  directions: directions.length,
  suppressed: suppressed.length,
  publicKeys: ["active", "direction"],
}));
