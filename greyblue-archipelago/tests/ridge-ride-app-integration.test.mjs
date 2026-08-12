import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(source, /import\s+\{\s*LiveRidgeRide,\s*ridgeRideCompletionMessage\s*\}\s+from\s+"\.\/core\/ridge-ride-live\.js"/);
assert.match(source, /const ridgeRide = new LiveRidgeRide\(\)/);
assert.match(source, /let ridgeRideTelemetry = ridgeRide\.publicState\(\)/);

const ridgeLiftAssignments = source.match(/const ridgeLift = deriveLiveRidgeLift\(\)/g) || [];
assert.equal(ridgeLiftAssignments.length, 1, "live traversal must reuse one ridge-lift derivation per frame");
assert.match(source, /controller\.setEnvironmentVerticalBias\(ridgeLift\.verticalBias\)/);
assert.match(source, /ridgeLiftActive:\s*ridgeLift\.active === true/);
assert.doesNotMatch(source, /ridgeRide[\s\S]{0,220}sampleSurfaceAt\(/, "ridge ride must not own a second terrain sample");

assert.match(source, /const ridgeRideResult = ridgeRide\.update\(\{/);
assert.match(source, /ready:\s*Boolean\(dragon && heroIsle\)/);
assert.match(source, /airborne:\s*controller\.airborne/);
assert.match(source, /grounded:\s*Boolean\(lastCollision\.grounded\)/);
assert.match(source, /landing:\s*controller\.landingRequested/);
assert.match(source, /recovering:\s*recovering \|\| Boolean\(lastCollision\.requiresRecovery\)/);
assert.match(source, /crossing:\s*Boolean\(activeCrossingRouteId\)/);
assert.match(source, /position:\s*\{ x: position\.x, z: position\.z \}/);

assert.match(source, /ridgeRideTelemetry = ridgeRideResult\.state/);
assert.match(source, /ridgeRideCompletionMessage\(ridgeRideResult\)/);
assert.match(source, /if \(ridgeRideMessage\) setRouteChoiceStatus\(ridgeRideMessage\)/, "completion should reuse the existing restrained status surface");
assert.match(source, /ridgeRide:\s*ridgeRideTelemetry/, "bounded ridge-ride state must be published");

assert.match(source, /function recover\(\)[\s\S]*ridgeRideTelemetry = ridgeRide\.interrupt\(\)/, "recovery must interrupt an incomplete ride");
assert.match(source, /function setPaused\([\s\S]*if \(paused\) ridgeRideTelemetry = ridgeRide\.interrupt\(\)/, "pause must interrupt an incomplete ride");
assert.match(source, /addEventListener\("blur",[\s\S]*ridgeRideTelemetry = ridgeRide\.interrupt\(\)/, "focus loss must interrupt an incomplete ride");

assert.doesNotMatch(source, /new\s+Raycaster\s*\(/, "ridge ride must not add scene raycasting");
assert.doesNotMatch(source, /setInterval\s*\(|setTimeout\s*\([^)]*ridgeRide|requestAnimationFrame\s*\([^)]*ridgeRide/i, "ridge ride must not add a second timing owner");

console.log("ridge-ride app integration contract: ok");
