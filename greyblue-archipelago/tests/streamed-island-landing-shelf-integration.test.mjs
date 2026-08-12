import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/streamed-island-three-adapter.js', import.meta.url), 'utf8');

assert.match(source,
  /import\s+\{\s*profileStreamedLandingShelfVertices\s*\}\s+from\s+'\.\/streamed-island-landing-shelf\.js'/);
assert.match(source,
  /const profiled = profileStreamedIslandVertices\(basePositions, island\);[\s\S]*const withLandingShelf = profileStreamedLandingShelfVertices\(profiled, island\);/,
  'landing shelf presentation must compose after deterministic geology');
assert.match(source, /attribute\.array\.set\(withLandingShelf\)/,
  'composed presentation profile must remain the single reset-time geometry write');
assert.match(source, /streamedIslandBasePositions:\s*captureBasePositions\(geometry\)/,
  'pool must retain immutable base geometry before any island profile');
assert.match(source, /applyIslandGeology\(mesh\.geometry, basePositions, island\)/,
  'each reset must derive presentation from retained base geometry');
assert.match(source, /if \(!island\)[\s\S]*mesh\.scale\.set\(1, 1, 1\)/,
  'release-to-idle must continue through the same base-restoring reset path');
assert.doesNotMatch(source, /requestAnimationFrame|setInterval|setTimeout/,
  'landing shelf presentation must not add a second update cadence');

console.log('streamed island landing shelf integration contract passed');
