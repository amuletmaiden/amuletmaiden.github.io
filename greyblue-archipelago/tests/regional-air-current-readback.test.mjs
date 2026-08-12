import assert from "node:assert/strict";
import {
  deriveRegionalAirCurrentReadback,
  REGIONAL_AIR_CURRENT_READBACK_MIN_MAGNITUDE,
} from "../src/core/regional-air-current-readback.js";

const cases = [
  [{ x: 0, z: 2 }, 0, "withwind"],
  [{ x: 0, z: -2 }, 0, "headwind"],
  [{ x: -2, z: 0 }, 0, "cross-left"],
  [{ x: 2, z: 0 }, 0, "cross-right"],
  [{ x: 2, z: 0 }, Math.PI / 2, "withwind"],
  [{ x: -2, z: 0 }, Math.PI / 2, "headwind"],
];

for (const [airCurrent, yaw, expected] of cases) {
  const result = deriveRegionalAirCurrentReadback({ airCurrent, yaw, active: true });
  assert.deepEqual(result, { active: true, direction: expected });
  assert.deepEqual(Object.keys(result).sort(), ["active", "direction"]);
  assert.equal("x" in result, false);
  assert.equal("z" in result, false);
}

assert.deepEqual(
  deriveRegionalAirCurrentReadback({ airCurrent: { x: 4, z: 0 }, yaw: 0, active: false }),
  { active: false, direction: null },
);
assert.deepEqual(
  deriveRegionalAirCurrentReadback({
    airCurrent: { x: REGIONAL_AIR_CURRENT_READBACK_MIN_MAGNITUDE * 0.5, z: 0 },
    yaw: 0,
    active: true,
  }),
  { active: false, direction: null },
);
assert.deepEqual(
  deriveRegionalAirCurrentReadback({ airCurrent: { x: Number.NaN, z: 2 }, yaw: 0, active: true }),
  { active: false, direction: null },
);
assert.deepEqual(
  deriveRegionalAirCurrentReadback({ airCurrent: { x: 2, z: 0 }, yaw: Number.POSITIVE_INFINITY, active: true }),
  { active: false, direction: null },
);

const source = { x: 1.5, z: -2.25 };
const copy = { ...source };
deriveRegionalAirCurrentReadback({ airCurrent: source, yaw: 0.4, active: true });
assert.deepEqual(source, copy, "readback must not mutate authored current metadata");

console.log(JSON.stringify({ status: "pass", cases: cases.length, publicKeys: ["active", "direction"] }));
