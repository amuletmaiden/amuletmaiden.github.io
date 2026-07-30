import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
assert.ok(source.includes("const FALLBACK_SPAWN = Object.freeze({ x: 0, y: 160, z: 0 });"));
assert.ok(source.includes("save?.position?.x ?? FALLBACK_SPAWN.x"));
assert.ok(source.includes("save?.position?.y ?? FALLBACK_SPAWN.y"));
assert.ok(source.includes("save?.position?.z ?? FALLBACK_SPAWN.z"));
assert.ok(source.includes("}, FALLBACK_SPAWN);"));
assert.ok(!source.includes("{ x: 0, y: 160, z: 220 }"), "recovery must not target open water");
assert.ok(!source.includes("save?.position?.z ?? 180"), "new games must not start over open water");
console.log("spawn contract tests passed");
