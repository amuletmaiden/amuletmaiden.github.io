import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/flight/vertical-energy-coupling.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { deriveVerticalEnergySpeedBias } = await import(moduleUrl);

assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: 0, planarSpeed: 40 }),
  0,
  "level flight is unchanged",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: -2, planarSpeed: 40 }),
  0,
  "shallow descent remains inside the dead zone",
);
assert.ok(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: -8, planarSpeed: 40 }) > 0,
  "meaningful descent adds planar target speed",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: -30, planarSpeed: 40 }),
  5.5,
  "dive gain is capped",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: 10, planarSpeed: 12 }),
  0,
  "low-speed climb cannot deepen a stall",
);
assert.ok(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: 10, planarSpeed: 40 }) < 0,
  "meaningful climb at useful speed trades some planar target speed",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: 30, planarSpeed: 60 }),
  -3.5,
  "climb tradeoff is capped",
);
assert.equal(
  deriveVerticalEnergySpeedBias({
    airborne: true,
    landingRequested: true,
    verticalVelocity: -18,
    planarSpeed: 60,
  }),
  0,
  "landing mode receives no dive gain",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: false, verticalVelocity: -18, planarSpeed: 60 }),
  0,
  "grounded state is neutral",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: Number.NaN, planarSpeed: 60 }),
  0,
  "malformed vertical state fails neutral",
);
assert.equal(
  deriveVerticalEnergySpeedBias({ airborne: true, verticalVelocity: -8, planarSpeed: -1 }),
  0,
  "malformed planar speed fails neutral",
);

console.log("vertical-energy-coupling tests passed");
