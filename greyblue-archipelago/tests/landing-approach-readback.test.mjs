import assert from "node:assert/strict";
import { deriveLandingApproachReadback } from "../src/world/landing-approach-readback.js";

const corridor = Object.freeze({
  entry: Object.freeze({ x: 0, z: 100 }),
  touchdown: Object.freeze({ x: 0, z: 0 }),
  width: 100,
  maximumDescentRate: 34,
});
const base = {
  eligible: true,
  airborne: true,
  interrupted: false,
  position: { x: 0, z: 60 },
  yaw: Math.PI,
  verticalVelocity: -6,
  corridor,
};

assert.deepEqual(
  deriveLandingApproachReadback(base),
  { active: true, alignment: "lined", descent: "steady" },
  "centered forward approach produces a compact lined/steady readback",
);
assert.equal(
  deriveLandingApproachReadback({ ...base, position: { x: -32, z: 60 } }).alignment,
  "left",
  "one side of the authored lane is classified left",
);
assert.equal(
  deriveLandingApproachReadback({ ...base, position: { x: 32, z: 60 } }).alignment,
  "right",
  "the opposite side is classified right",
);
assert.equal(
  deriveLandingApproachReadback({ ...base, verticalVelocity: -1 }).descent,
  "shallow",
  "gentle descent is qualitative shallow",
);
assert.equal(
  deriveLandingApproachReadback({ ...base, verticalVelocity: -16 }).descent,
  "steep",
  "large descent relative to authored corridor limit is qualitative steep",
);

for (const sample of [
  { eligible: false },
  { airborne: false },
  { interrupted: true },
  { position: { x: 90, z: 60 } },
  { position: { x: 0, z: 160 } },
  { yaw: 0 },
  { verticalVelocity: Number.NaN },
  { corridor: { ...corridor, width: 0 } },
]) {
  assert.deepEqual(
    deriveLandingApproachReadback({ ...base, ...sample }),
    { active: false, alignment: null, descent: null },
    "outside, receding, interrupted, ineligible or malformed state fails closed",
  );
}

const caller = {
  ...base,
  position: { ...base.position },
  corridor: {
    ...corridor,
    entry: { ...corridor.entry },
    touchdown: { ...corridor.touchdown },
  },
};
const before = structuredClone(caller);
deriveLandingApproachReadback(caller);
assert.deepEqual(caller, before, "approach readback leaves caller/world geometry immutable");

console.log("landing approach readback tests passed");
