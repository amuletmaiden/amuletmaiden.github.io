import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dragon/runtime.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { DragonRuntime } = await import(moduleUrl);

class FakeAction {
  constructor(name) {
    this.name = name;
    this.calls = [];
  }
  reset() { this.calls.push(["reset"]); return this; }
  setEffectiveWeight(value) { this.calls.push(["weight", value]); return this; }
  setEffectiveTimeScale(value) { this.calls.push(["rate", value]); return this; }
  fadeIn(value) { this.calls.push(["fadeIn", value]); return this; }
  fadeOut(value) { this.calls.push(["fadeOut", value]); return this; }
  play() { this.calls.push(["play"]); return this; }
}

class FakeMixer {
  constructor() { this.actions = new Map(); }
  clipAction(clip) {
    if (!this.actions.has(clip.name)) this.actions.set(clip.name, new FakeAction(clip.name));
    return this.actions.get(clip.name);
  }
  update() {}
}

const idle = { name: "Dragon_Idle_Sentinel_v44" };
const readiness = { name: "Dragon_Wing_Readiness_Test" };
const complete = [idle, { name: "Dragon_Idle_Sentinel_v44.001" }, readiness];
const poweredFlight = {
  airborne: true,
  landingRequested: false,
  mode: "powered-flight",
  speed: 31,
  bank: 0,
  velocity: { x: 0, z: 31 },
};

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);

  runtime.bindClips([]);
  runtime.updateFromFlight(poweredFlight);
  assert.deepEqual(runtime.telemetry.available, []);
  assert(runtime.telemetry.missing.includes("flight"));

  runtime.bindClips([idle]);
  assert.equal(runtime.telemetry.state, "grounded-idle");
  assert.equal(runtime.telemetry.clip, idle.name);
  assert.deepEqual(runtime.telemetry.missing, []);

  runtime.updateFromFlight(poweredFlight);
  assert.equal(runtime.telemetry.state, "flight");
  assert.equal(runtime.telemetry.clip, idle.name, "partial approved list may temporarily fall back to idle");
  assert.equal(runtime.telemetry.fallback, true);

  const partialIdleAction = mixer.actions.get(idle.name);
  const partialResetCount = partialIdleAction.calls.filter(([name]) => name === "reset").length;

  const available = runtime.bindClips(complete);
  assert.deepEqual(available, complete.map((clip) => clip.name.toLowerCase()));
  assert.equal(runtime.telemetry.state, "grounded-idle");
  assert.equal(runtime.telemetry.clip, idle.name);
  assert.deepEqual(runtime.telemetry.missing, []);
  assert.equal(runtime.currentClip, idle.name.toLowerCase());
  assert.equal(runtime.currentAction, partialIdleAction);
  assert.equal(
    partialIdleAction.calls.filter(([name]) => name === "reset").length,
    partialResetCount + 1,
    "complete-list rebind restarts the newly authoritative grounded action exactly once",
  );

  const selected = runtime.updateFromFlight(poweredFlight);
  assert.equal(selected, readiness.name);
  assert.equal(runtime.telemetry.state, "flight");
  assert.equal(runtime.telemetry.clip, readiness.name);
  assert.equal(runtime.currentClip, readiness.name.toLowerCase());
  assert.equal(runtime.currentAction, mixer.actions.get(readiness.name));
  assert.deepEqual(runtime.telemetry.missing, []);
}

{
  const runtime = new DragonRuntime({}, new FakeMixer());
  runtime.bindClips([readiness]);
  assert.equal(runtime.telemetry.state, "grounded-idle");
  assert.equal(runtime.telemetry.clip, null, "flight-only partial list must not masquerade as a grounded pose");
  assert(runtime.telemetry.missing.includes("grounded-idle"));

  runtime.updateFromFlight(poweredFlight);
  assert.equal(runtime.telemetry.clip, readiness.name);
  assert.equal(runtime.telemetry.state, "flight");
  assert.deepEqual(runtime.telemetry.missing, ["grounded-idle"]);

  runtime.bindClips(complete);
  assert.equal(runtime.telemetry.state, "grounded-idle");
  assert.equal(runtime.telemetry.clip, idle.name);
  assert.deepEqual(runtime.telemetry.missing, [], "complete-list rebind clears partial-list failure telemetry");
}

console.log("dragon-runtime rebind tests passed");