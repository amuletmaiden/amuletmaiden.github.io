import assert from "node:assert/strict";
import { NEUTRAL_FLIGHT_RESUME, normalizeFlightResume } from "../src/core/flight-resume.js";

assert.deepEqual(normalizeFlightResume(null), {
  yaw: 0,
  velocity: { x: 0, y: 0, z: 0 },
  airborne: true,
  landingRequested: false,
}, "missing legacy resume state must fail to a safe neutral airborne continuation");

const ordinary = normalizeFlightResume({
  yaw: Math.PI / 3,
  velocity: { x: 18, y: 4, z: 25 },
  airborne: true,
  landingRequested: true,
});
assert.equal(ordinary.yaw, Math.PI / 3);
assert.deepEqual(ordinary.velocity, { x: 18, y: 4, z: 25 });
assert.equal(ordinary.airborne, true);
assert.equal(ordinary.landingRequested, true);

const wrapped = normalizeFlightResume({ yaw: Math.PI * 5, velocity: { x: 0, y: 0, z: 0 } });
assert.ok(wrapped.yaw >= -Math.PI && wrapped.yaw <= Math.PI, "yaw must normalize to the ordinary signed turn range");
assert.ok(Math.abs(Math.abs(wrapped.yaw) - Math.PI) < 1e-12);

const bounded = normalizeFlightResume({
  yaw: Infinity,
  velocity: { x: 1000, y: -999, z: 1000 },
  airborne: true,
  landingRequested: true,
});
assert.equal(bounded.yaw, 0);
assert.ok(Math.hypot(bounded.velocity.x, bounded.velocity.z) <= 72 + 1e-9, "planar resume speed must be hard bounded");
assert.equal(bounded.velocity.y, -24, "vertical resume speed must be hard bounded");
assert.equal(bounded.landingRequested, true);

const malformedComponents = normalizeFlightResume({
  yaw: "bad",
  velocity: { x: NaN, y: undefined, z: "nope" },
  airborne: true,
  landingRequested: "yes",
});
assert.deepEqual(malformedComponents, {
  yaw: 0,
  velocity: { x: 0, y: 0, z: 0 },
  airborne: true,
  landingRequested: false,
});

const grounded = normalizeFlightResume({
  yaw: -0.75,
  velocity: { x: 50, y: 12, z: -30 },
  airborne: false,
  landingRequested: true,
});
assert.deepEqual(grounded, {
  yaw: -0.75,
  velocity: { x: 0, y: 0, z: 0 },
  airborne: false,
  landingRequested: false,
}, "grounded resume must discard stale motion and landing request");

const caller = {
  yaw: 0.5,
  velocity: { x: 10, y: 2, z: 12 },
  airborne: true,
  landingRequested: false,
};
const before = JSON.stringify(caller);
const result = normalizeFlightResume(caller);
assert.equal(JSON.stringify(caller), before, "normalization must not mutate caller state");
result.velocity.x = 0;
assert.equal(caller.velocity.x, 10, "normalized velocity must not alias caller state");

assert.deepEqual(Object.keys(NEUTRAL_FLIGHT_RESUME).sort(), ["airborne", "landingRequested", "velocity", "yaw"]);
assert.deepEqual(Object.keys(NEUTRAL_FLIGHT_RESUME.velocity).sort(), ["x", "y", "z"]);

console.log("flight resume normalization: ok");
