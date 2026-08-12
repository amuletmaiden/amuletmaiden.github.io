import assert from "node:assert/strict";
import { deriveRidgeLift, RIDGE_LIFT_LIMITS } from "../src/flight/ridge-lift.js";

const neutralCases = [
  {},
  { airborne: true, speed: 20, clearance: 24, terrainRise: 14 },
  { airborne: true, speed: 54, clearance: 24, terrainRise: 0 },
  { airborne: true, speed: 54, clearance: 90, terrainRise: 14 },
  { airborne: true, speed: 54, clearance: 24, terrainRise: 14, grounded: true },
  { airborne: true, speed: 54, clearance: 24, terrainRise: 14, landing: true },
  { airborne: true, speed: 54, clearance: 24, terrainRise: 14, recovering: true },
  { airborne: true, speed: 54, clearance: 24, terrainRise: 14, restoring: true },
];
for (const sample of neutralCases) {
  assert.deepEqual(deriveRidgeLift(sample), { active: false, strength: 0, verticalBias: 0 });
}

const full = deriveRidgeLift({
  airborne: true,
  speed: RIDGE_LIFT_LIMITS.fullSpeed,
  clearance: RIDGE_LIFT_LIMITS.fullClearance,
  terrainRise: RIDGE_LIFT_LIMITS.fullRise,
});
assert.equal(full.active, true);
assert.equal(full.strength, 1);
assert.equal(full.verticalBias, RIDGE_LIFT_LIMITS.maximumVerticalBias);
assert.ok(full.verticalBias < 3, "ridge lift remains well below ordinary climb authority");

const moderate = deriveRidgeLift({ airborne: true, speed: 42, clearance: 32, terrainRise: 9 });
assert.ok(moderate.active && moderate.strength > 0 && moderate.strength < 1);
const faster = deriveRidgeLift({ airborne: true, speed: 50, clearance: 32, terrainRise: 9 });
assert.ok(faster.verticalBias > moderate.verticalBias, "useful forward speed strengthens ridge lift");
const steeper = deriveRidgeLift({ airborne: true, speed: 50, clearance: 32, terrainRise: 13 });
assert.ok(steeper.verticalBias > faster.verticalBias, "a stronger rising slope strengthens ridge lift");
const tooClose = deriveRidgeLift({ airborne: true, speed: 54, clearance: 5, terrainRise: 20 });
assert.equal(tooClose.active, false, "unsafe near-contact terrain never manufactures lift");

for (const malformed of [
  { airborne: true, speed: NaN, clearance: 24, terrainRise: 14 },
  { airborne: true, speed: 54, clearance: NaN, terrainRise: 14 },
  { airborne: true, speed: 54, clearance: 24, terrainRise: Infinity },
]) {
  const result = deriveRidgeLift(malformed);
  assert.equal(result.active, false);
  assert.ok(Number.isFinite(result.strength));
  assert.ok(Number.isFinite(result.verticalBias));
}

for (let frame = 0; frame < 60 * 60; frame += 1) {
  const result = deriveRidgeLift({
    airborne: true,
    speed: 40 + Math.sin(frame / 31) * 22,
    clearance: 30 + Math.sin(frame / 43) * 25,
    terrainRise: 8 + Math.sin(frame / 57) * 10,
  });
  assert.ok(result.strength >= 0 && result.strength <= 1, `bounded strength at frame ${frame}`);
  assert.ok(result.verticalBias >= 0 && result.verticalBias <= RIDGE_LIFT_LIMITS.maximumVerticalBias, `bounded lift at frame ${frame}`);
}

console.log("ridge-lift: ok");
