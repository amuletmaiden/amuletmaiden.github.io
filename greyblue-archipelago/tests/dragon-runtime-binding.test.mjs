import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dragon/runtime.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { DragonRuntime } = await import(moduleUrl);

class Action {
  reset() { return this; }
  setEffectiveWeight() { return this; }
  setEffectiveTimeScale() { return this; }
  fadeIn() { return this; }
  fadeOut() { return this; }
  play() { return this; }
}

const mixer = {
  clipAction(clip) {
    if (clip.name === "Broken_Action") throw new Error("mixer rejected clip");
    return new Action();
  },
  update() {},
};

const runtime = new DragonRuntime({}, mixer);
const firstIdle = { name: " Dragon_Idle_Sentinel_v44 " };
const duplicateIdle = { name: "dragon_idle_sentinel_v44" };
const readiness = { name: "Dragon_Wing_Readiness_Test" };
const accepted = runtime.bindClips([
  null,
  {},
  { name: "   " },
  firstIdle,
  duplicateIdle,
  { name: "Broken_Action" },
  readiness,
]);

assert.deepEqual(accepted, [
  "dragon_idle_sentinel_v44",
  "broken_action",
  "dragon_wing_readiness_test",
]);
assert.equal(runtime.clips.get("dragon_idle_sentinel_v44"), firstIdle, "first approved case-insensitive name wins deterministically");
assert.equal(runtime.telemetry.clip, firstIdle.name, "trimmed lookup preserves the approved source clip name");
assert.deepEqual(runtime.telemetry.rejected.map(({ reason }) => reason), [
  "missing-name",
  "missing-name",
  "missing-name",
  "duplicate-name",
]);
assert.deepEqual(runtime.telemetry.actionErrors, [
  { name: "Broken_Action", reason: "mixer rejected clip" },
]);

const flightClip = runtime.updateFromFlight({ airborne: true, mode: "powered-flight", speed: 30, bank: 0 });
assert.equal(flightClip, readiness.name, "a failed unrelated mixer action cannot prevent valid flight selection");
assert.deepEqual(runtime.telemetry.actionErrors, [
  { name: "Broken_Action", reason: "mixer rejected clip" },
], "binding diagnostics survive subsequent state updates");

assert.doesNotThrow(() => runtime.bindClips(null));
assert.deepEqual(runtime.telemetry.available, []);
assert.equal(runtime.telemetry.clip, null);
assert(runtime.telemetry.missing.includes("grounded-idle"));

console.log("dragon-runtime binding tests passed");
