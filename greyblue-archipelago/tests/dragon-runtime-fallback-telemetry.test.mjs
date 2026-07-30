import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dragon/runtime.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { DragonRuntime } = await import(moduleUrl);

class Action {
  constructor(name, { throwOnPlay = false, throwOnRate = false } = {}) {
    this.name = name;
    this.throwOnPlay = throwOnPlay;
    this.throwOnRate = throwOnRate;
    this.calls = [];
  }
  reset() { this.calls.push("reset"); return this; }
  setEffectiveWeight() { this.calls.push("weight"); return this; }
  setEffectiveTimeScale() {
    this.calls.push("rate");
    if (this.throwOnRate) throw new Error(`${this.name} rate failed`);
    return this;
  }
  fadeIn() { this.calls.push("fadeIn"); return this; }
  fadeOut() { this.calls.push("fadeOut"); return this; }
  play() {
    this.calls.push("play");
    if (this.throwOnPlay) throw new Error(`${this.name} play failed`);
    return this;
  }
}

const idle = { name: "Dragon_Idle_Sentinel_v44" };
const readiness = { name: "Dragon_Wing_Readiness_Test" };
const brokenFlight = { name: "Dragon_Flight_Broken" };
const actions = new Map([
  [idle.name, new Action(idle.name)],
  [readiness.name, new Action(readiness.name)],
  [brokenFlight.name, new Action(brokenFlight.name, { throwOnPlay: true })],
]);
const mixer = {
  clipAction(clip) { return actions.get(clip.name) || null; },
  update() {},
};

{
  const runtime = new DragonRuntime({}, mixer);
  runtime.bindClips([idle, readiness]);
  assert.equal(runtime.telemetry.activeClip, idle.name);
  assert.equal(runtime.telemetry.fallbackReason, null);
  assert.equal(runtime.telemetry.transitionCount, 1);

  runtime.updateFromFlight({ airborne: true, mode: "powered-flight", speed: 30, bank: 0 });
  assert.equal(runtime.telemetry.clip, readiness.name);
  assert.equal(runtime.telemetry.activeClip, readiness.name);
  assert.equal(runtime.telemetry.fallbackReason, "role-fallback");
  assert.equal(runtime.telemetry.actionAvailable, true);
  assert.equal(runtime.telemetry.transitionCount, 2);

  runtime.updateFromFlight({ airborne: true, mode: "powered-flight", speed: 31, bank: 0 });
  assert.equal(runtime.telemetry.transitionCount, 2, "same active fallback action is not counted as a transition");
}

{
  const runtime = new DragonRuntime({}, mixer);
  runtime.bindClips([idle, brokenFlight]);
  assert.equal(runtime.telemetry.activeClip, idle.name);
  assert.doesNotThrow(() => runtime.updateFromFlight({ airborne: true, mode: "powered-flight", speed: 30, bank: 0 }));
  assert.equal(runtime.telemetry.clip, brokenFlight.name, "selected clip remains observable");
  assert.equal(runtime.telemetry.activeClip, idle.name, "failed action cannot replace the last active clip");
  assert.equal(runtime.telemetry.fallbackReason, "action-error");
  assert.equal(runtime.telemetry.actionFailure.reason, `${brokenFlight.name} play failed`);
  assert.equal(runtime.telemetry.transitionCount, 1);
}

{
  const runtime = new DragonRuntime({}, { clipAction() { return null; }, update() {} });
  runtime.bindClips([idle]);
  assert.equal(runtime.telemetry.clip, idle.name);
  assert.equal(runtime.telemetry.activeClip, null);
  assert.equal(runtime.telemetry.actionAvailable, false);
  assert.equal(runtime.telemetry.fallbackReason, "missing-action");
}

{
  const runtime = new DragonRuntime({}, null);
  runtime.bindClips([]);
  runtime.updateFromFlight({ airborne: true, mode: "powered-flight", speed: 20, bank: 0 });
  assert.equal(runtime.telemetry.clip, null);
  assert.equal(runtime.telemetry.activeClip, null);
  assert.equal(runtime.telemetry.fallbackReason, "missing-role");
  assert(runtime.telemetry.missing.includes("flight"));
}

console.log("dragon-runtime fallback telemetry tests passed");
