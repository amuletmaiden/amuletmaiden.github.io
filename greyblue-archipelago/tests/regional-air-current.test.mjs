import assert from "node:assert/strict";
import {
  deriveRegionalAirCurrent,
  REGIONAL_AIR_CURRENT_MAX_SPEED,
} from "../src/flight/regional-air-current.js";

const ordinary = {
  airCurrent: { x: 3, z: 4 },
  airborne: true,
  landingRequested: false,
  takeoffActive: false,
  stallFactor: 0,
  grounded: false,
  recovering: false,
  planarSpeed: 30,
};

{
  const result = deriveRegionalAirCurrent(ordinary);
  assert.equal(result.active, true);
  assert.ok(Math.abs(Math.hypot(result.x, result.z) - REGIONAL_AIR_CURRENT_MAX_SPEED) < 1e-9);
  assert.ok(result.x > 0 && result.z > 0, "current keeps authored direction");
}

{
  const result = deriveRegionalAirCurrent({ ...ordinary, airCurrent: { x: -1.5, z: 0.5 } });
  assert.equal(result.active, true);
  assert.ok(result.x < 0 && result.z > 0);
  assert.ok(Math.hypot(result.x, result.z) <= REGIONAL_AIR_CURRENT_MAX_SPEED);
}

{
  const half = deriveRegionalAirCurrent({ ...ordinary, planarSpeed: 18, airCurrent: { x: 4.2, z: 0 } });
  assert.ok(Math.abs(half.x - 2.1) < 1e-9, "current authority fades in with useful speed");
  assert.equal(half.z, 0);
}

for (const state of [
  { airborne: false },
  { landingRequested: true },
  { takeoffActive: true },
  { grounded: true },
  { recovering: true },
  { stallFactor: 0.36 },
  { planarSpeed: 12 },
]) {
  assert.deepEqual(deriveRegionalAirCurrent({ ...ordinary, ...state }), { active: false, x: 0, z: 0 });
}

for (const airCurrent of [
  null,
  {},
  { x: NaN, z: 1 },
  { x: 1, z: Infinity },
  { x: 0, z: 0 },
]) {
  assert.deepEqual(deriveRegionalAirCurrent({ ...ordinary, airCurrent }), { active: false, x: 0, z: 0 });
}

const source = Object.freeze({ x: 1.25, z: -2.5 });
deriveRegionalAirCurrent({ ...ordinary, airCurrent: source });
assert.deepEqual(source, { x: 1.25, z: -2.5 });
