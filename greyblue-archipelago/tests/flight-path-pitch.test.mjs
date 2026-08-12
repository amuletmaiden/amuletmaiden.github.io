import assert from "node:assert/strict";
import {
  deriveFlightPathPitchBias,
  FLIGHT_PATH_PITCH_LIMITS,
} from "../src/flight/flight-path-pitch.js";

assert.equal(deriveFlightPathPitchBias(), 0, "malformed/default state fails neutral");
assert.equal(deriveFlightPathPitchBias({ airborne: false, planarSpeed: 40, verticalVelocity: 12 }), 0);
assert.equal(deriveFlightPathPitchBias({ airborne: true, planarSpeed: 40, verticalVelocity: 0 }), 0, "level flight is parity");

const climbing = deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: 36,
  verticalVelocity: 10,
  climb: 0,
});
const descending = deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: 36,
  verticalVelocity: -10,
  climb: 0,
});
assert.ok(climbing > 0, "real climb momentum retains nose-up attitude at neutral input");
assert.ok(descending < 0, "real descent momentum retains nose-down attitude at neutral input");
assert.ok(Math.abs(climbing) <= FLIGHT_PATH_PITCH_LIMITS.maximumBias);
assert.ok(Math.abs(descending) <= FLIGHT_PATH_PITCH_LIMITS.maximumBias);

assert.equal(deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: 36,
  verticalVelocity: 10,
  climb: -1,
}), 0, "explicit dive input overrides opposite residual climb attitude");
assert.equal(deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: 36,
  verticalVelocity: -10,
  climb: 1,
}), 0, "explicit climb input overrides opposite residual descent attitude");

const lowSpeed = deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: FLIGHT_PATH_PITCH_LIMITS.minimumSpeed,
  verticalVelocity: 12,
});
assert.equal(lowSpeed, 0, "very low speed does not manufacture flight-path pose authority");
assert.equal(deriveFlightPathPitchBias({
  airborne: true,
  landingRequested: true,
  planarSpeed: 30,
  verticalVelocity: -8,
}), 0, "landing pose remains authoritative");
assert.equal(deriveFlightPathPitchBias({
  airborne: true,
  stallFactor: 0.5,
  planarSpeed: 30,
  verticalVelocity: -8,
}), 0, "stall pose remains authoritative");

const saturated = deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: 22,
  verticalVelocity: 1000,
});
assert.equal(saturated, FLIGHT_PATH_PITCH_LIMITS.maximumBias, "extreme finite ascent remains bounded");
assert.equal(deriveFlightPathPitchBias({
  airborne: true,
  planarSpeed: Number.NaN,
  verticalVelocity: Number.POSITIVE_INFINITY,
}), 0, "non-finite inputs fail neutral");

console.log("flight-path-pitch: ok");
