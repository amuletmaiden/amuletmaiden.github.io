import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(source, /import\s+\{\s*deriveRidgeLift\s*\}\s+from\s+"\.\/flight\/ridge-lift\.js"/);
assert.match(source, /const RIDGE_LIFT_PROBE_DISTANCE = 46/);
assert.match(source, /function sampleSurfaceAt\(x, z\)/, "ridge lift must reuse canonical terrain ownership");
assert.match(source, /function deriveLiveRidgeLift\(\)/);
assert.match(source, /const current = sampleSurfaceAt\(position\.x, position\.z\)/);
assert.match(source, /const ahead = sampleSurfaceAt\(position\.x \+ forwardX \* RIDGE_LIFT_PROBE_DISTANCE, position\.z \+ forwardZ \* RIDGE_LIFT_PROBE_DISTANCE\)/);
assert.match(source, /current\.surface === "terrain" && ahead\.surface === "terrain"/, "water or missing terrain must not synthesize ridge lift");
assert.match(source, /terrainRise:\s*usableTerrain \? ahead\.height - current\.height : 0/);
assert.match(source, /grounded:\s*lastCollision\.grounded/);
assert.match(source, /landing:\s*controller\.landingRequested/);
assert.match(source, /recovering:\s*lastCollision\.requiresRecovery/);
assert.match(source, /controller\.setEnvironmentVerticalBias\(0\)/, "interruptions must have an explicit stale-bias clear path");
assert.match(source, /controller\.setEnvironmentVerticalBias\([^\n;]*deriveLiveRidgeLift\(\)[\s\S]*?verticalBias|deriveLiveRidgeLift\(\)[\s\S]*?setEnvironmentVerticalBias/, "ordinary app cadence must pass only derived vertical bias into the controller");
assert.doesNotMatch(source, /new\s+Raycaster\s*\(/, "ridge lift must not introduce scene raycasting");
assert.doesNotMatch(source, /setInterval\s*\(|setTimeout\s*\([^,]+,\s*[^)]*RIDGE_LIFT|requestAnimationFrame\s*\([^)]*ridge/i, "ridge lift must not add a second timing owner");

console.log("ridge-lift app integration contract: ok");
