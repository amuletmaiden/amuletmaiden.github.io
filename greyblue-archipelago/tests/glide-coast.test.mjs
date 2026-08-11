import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/flight/glide-coast.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { deriveGlideCoastTarget } = await import(moduleUrl);

const neutralFast = deriveGlideCoastTarget({
  airborne: true,
  throttle: 0,
  planarSpeed: 48,
  ordinaryTargetSpeed: 20,
});
assert.equal(neutralFast, 46.25, "fast neutral flight retains most earned momentum");
assert.ok(neutralFast <= 48, "coast target never accelerates above current speed");
assert.ok(neutralFast > 20, "coast target stays above ordinary neutral baseline while fast");

const slowerNeutral = deriveGlideCoastTarget({
  airborne: true,
  throttle: 0,
  planarSpeed: 38,
  ordinaryTargetSpeed: 20,
});
assert.ok(slowerNeutral < neutralFast, "coast target falls monotonically with current speed");

assert.equal(
  deriveGlideCoastTarget({ airborne: true, throttle: 0, planarSpeed: 24, ordinaryTargetSpeed: 20 }),
  20,
  "low speed returns to ordinary neutral target",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, throttle: 0.4, planarSpeed: 48, ordinaryTargetSpeed: 36.8 }),
  36.8,
  "positive throttle remains authoritative",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, throttle: -0.4, planarSpeed: 48, ordinaryTargetSpeed: 15.2 }),
  15.2,
  "deliberate reverse throttle cancels coast",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, landingRequested: true, throttle: 0, planarSpeed: 48, ordinaryTargetSpeed: 14 }),
  14,
  "landing target remains authoritative",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, takeoffActive: true, throttle: 0, planarSpeed: 48, ordinaryTargetSpeed: 20 }),
  20,
  "takeoff transient receives no glide retention",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, stallPressure: 0.2, throttle: 0, planarSpeed: 48, ordinaryTargetSpeed: 20 }),
  20,
  "stall recovery receives no glide retention",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, throttle: Number.NaN, planarSpeed: 48, ordinaryTargetSpeed: 20 }),
  20,
  "malformed throttle fails to ordinary target",
);
assert.equal(
  deriveGlideCoastTarget({ airborne: true, throttle: 0, planarSpeed: Number.POSITIVE_INFINITY, ordinaryTargetSpeed: 20 }),
  20,
  "malformed speed fails to ordinary target",
);

console.log("glide coast tests passed");
