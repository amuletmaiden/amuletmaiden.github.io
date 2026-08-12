import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(source, /import\s+\{\s*composeLandingShelfHeight\s*\}\s+from\s+"\.\/world\/landing-shelf-surface\.js"/);
assert.match(source, /const baseHeight = island\.height \* normalized \* normalized \* 0\.58/);
assert.match(source, /const height = composeLandingShelfHeight\(\{[\s\S]*baseHeight,[\s\S]*x,[\s\S]*z,[\s\S]*landingZones:\s*island\.landingZones/);
assert.match(source, /if \(result\.surface === "water" \|\| height > result\.height\)/,
  "shelf-adjusted per-island height must still feed the existing highest-surface winner");
assert.match(source, /sampleSurface:\s*sampleSurfaceAt/,
  "collision must continue to consume canonical sampleSurfaceAt");
assert.match(source, /sampleHeight:\s*terrainHeightAt/,
  "camera terrain protection must continue to consume canonical terrainHeightAt");
assert.match(source, /const current = sampleSurfaceAt\(position\.x, position\.z\)/,
  "ridge lift must continue to consume canonical sampleSurfaceAt");
assert.doesNotMatch(source, /landingRequested[\s\S]{0,120}landingZones/,
  "landing shelves must not be special-cased through landing-request collision state");

console.log("landing shelf app integration contract passed");
