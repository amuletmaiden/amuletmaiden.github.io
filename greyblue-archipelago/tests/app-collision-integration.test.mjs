import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(source, /import\s+\{\s*FlightCollisionResolver\s*\}\s+from\s+"\.\/flight\/collision\.js"/);
assert.match(source, /const collisionResolver = new FlightCollisionResolver\(\)/);
assert.match(source, /function sampleSurfaceAt\(x, z\)/);
assert.match(source, /surface:\s*"water"/);
assert.match(source, /surface:\s*"terrain"/);
assert.match(source, /collisionResolver\.resolve\(\{[\s\S]*previous,[\s\S]*proposed,[\s\S]*sampleSurface:\s*sampleSurfaceAt/);
assert.match(source, /collisionResolver\.reset\(recovered\.position\)/);
assert.match(source, /collision:\s*lastCollision/);
assert.doesNotMatch(source, /controller\.resolveGround\(/, "entrypoint must not bypass swept collision");
assert.match(source, /collision\.grounded[\s\S]*controller\.airborne = false/);
assert.match(source, /collision\.requiresRecovery[\s\S]*recover\(\)/);

console.log("app collision integration contract passed");
