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
  setEffectiveTimeScale(value) { this.calls.push(["rate", value]); this.rate = value; return this; }
  fadeIn(value) { this.calls.push(["fadeIn", value]); return this; }
  fadeOut(value) { this.calls.push(["fadeOut", value]); return this; }
  play() { this.calls.push(["play"]); return this; }
}

class FakeMixer {
  constructor() { this.actions = new Map(); this.updates = []; }
  clipAction(clip) {
    if (!this.actions.has(clip.name)) this.actions.set(clip.name, new FakeAction(clip.name));
    return this.actions.get(clip.name);
  }
  update(dt) { this.updates.push(dt); }
}

const clips = [
  { name: "Dragon_Idle_Sentinel_v44" },
  { name: "Dragon_Idle_Sentinel_v44.001" },
  { name: "Dragon_Wing_Readiness_Test" },
];

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);
  const available = runtime.bindClips(clips);
  assert.equal(available.length, 3);
  assert.equal(runtime.telemetry.clip, "Dragon_Idle_Sentinel_v44");
  assert.equal(runtime.telemetry.fallback, false);

  const flightClip = runtime.updateFromFlight({
    airborne: true,
    landingRequested: false,
    mode: "powered-flight",
    speed: 31,
    bank: 0,
    velocity: { x: 0, z: 31 },
  });
  assert.equal(flightClip, "Dragon_Wing_Readiness_Test");
  assert.equal(runtime.telemetry.fallback, true, "approved readiness clip is an explicit flight fallback");
  assert.deepEqual(runtime.telemetry.missing, []);

  const idleAction = mixer.actions.get("Dragon_Idle_Sentinel_v44");
  const flightAction = mixer.actions.get("Dragon_Wing_Readiness_Test");
  assert.ok(idleAction.calls.some(([name]) => name === "fadeOut"));
  assert.ok(flightAction.calls.some(([name]) => name === "fadeIn"));
  assert.ok(flightAction.calls.some(([name]) => name === "play"));

  runtime.updateFromFlight({
    airborne: true,
    landingRequested: false,
    mode: "glide",
    speed: 52,
    bank: 0,
    velocity: { x: 0, z: 52 },
  });
  assert.equal(runtime.telemetry.state, "glide");
  assert.equal(runtime.telemetry.clip, "Dragon_Wing_Readiness_Test");
  assert.equal(runtime.telemetry.playbackRate, 0.72);

  runtime.update(1 / 60);
  assert.deepEqual(mixer.updates, [1 / 60]);
}

{
  const runtime = new DragonRuntime({}, null);
  runtime.bindClips([]);
  const clip = runtime.updateFromFlight({ airborne: true, speed: 20, bank: 0 });
  assert.equal(clip, null);
  assert.ok(runtime.telemetry.missing.includes("flight"));
}

console.log("dragon-runtime tests passed");
