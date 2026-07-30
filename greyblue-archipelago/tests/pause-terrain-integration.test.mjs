import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(source, /import \{ createIsleTerrainSampler \} from "\.\/flight\/isle-terrain-sampler\.js";/);
assert.match(source, /heroTerrain = createIsleTerrainSampler\(\{ THREE, root: heroIsle, bounds: heroBounds \}\);/);
assert.match(source, /const sampledIsleHeight = heroTerrain\?\.sample\(x, z\);/);
assert.match(source, /sampleSurface: sampleSurfaceAt,/);
assert.match(source, /sampleHeight: terrainHeightAt,/);
assert.match(source, /heroTerrain: heroTerrain\?\.telemetry \|\| null,/);
assert.doesNotMatch(source, /id: "greyblue-isle"[\s\S]{0,100}heroBounds\.min\.y \+ 4/);

assert.match(source, /let paused = false;/);
assert.match(source, /if \(input\.pause\) \{[\s\S]*setPaused\(!paused, now\);/);
assert.match(source, /function setPaused\(nextPaused, now\) \{[\s\S]*flightInput\.clear\(\);[\s\S]*lastFrameAt = now;[\s\S]*if \(paused\) persist\(\);/);
const pausedGate = source.indexOf("  if (paused) {");
const controllerStep = source.indexOf("  const flight = controller.step", pausedGate);
assert.ok(pausedGate >= 0 && controllerStep > pausedGate, "pause gate precedes flight integration");
assert.match(source.slice(pausedGate, controllerStep), /renderer\.render\(scene, camera\);[\s\S]*return;/);
assert.match(source, /paused: true,/);
assert.match(source, /paused: false,/);
assert.match(source, /chaseCamera\.snapTo\(position, controller\.yaw\);[\s\S]*persist\(\);/);

console.log("pause and terrain integration contract passed");
