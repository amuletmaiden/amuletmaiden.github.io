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

function flight(overrides = {}) {
  return {
    airborne: true,
    landingRequested: false,
    mode: "powered-flight",
    speed: 31,
    bank: 0,
    velocity: { x: 0, z: 31 },
    ...overrides,
  };
}

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);
  const available = runtime.bindClips(clips);
  assert.equal(available.length, 3);
  assert.equal(runtime.telemetry.clip, "Dragon_Idle_Sentinel_v44");
  assert.equal(runtime.telemetry.fallback, false);

  const flightClip = runtime.updateFromFlight(flight());
  assert.equal(flightClip, "Dragon_Wing_Readiness_Test");
  assert.equal(runtime.telemetry.fallback, true, "approved readiness clip is an explicit flight fallback");
  assert.deepEqual(runtime.telemetry.missing, []);

  const idleAction = mixer.actions.get("Dragon_Idle_Sentinel_v44");
  const flightAction = mixer.actions.get("Dragon_Wing_Readiness_Test");
  assert.ok(idleAction.calls.some(([name]) => name === "fadeOut"));
  assert.ok(flightAction.calls.some(([name]) => name === "fadeIn"));
  assert.ok(flightAction.calls.some(([name]) => name === "play"));

  const resetsBefore = flightAction.calls.filter(([name]) => name === "reset").length;
  runtime.updateFromFlight(flight({ speed: 35 }));
  assert.equal(
    flightAction.calls.filter(([name]) => name === "reset").length,
    resetsBefore,
    "same fallback action must not restart when only flight telemetry changes",
  );

  runtime.updateFromFlight(flight({ mode: "glide", speed: 52 }));
  assert.equal(runtime.telemetry.state, "glide");
  assert.equal(runtime.telemetry.clip, "Dragon_Wing_Readiness_Test");
  assert.equal(runtime.telemetry.playbackRate, 0.72);

  runtime.update(1 / 60);
  assert.deepEqual(mixer.updates, [1 / 60]);
  assert.equal(runtime.telemetry.stateAge, 1 / 60);
}

{
  const runtime = new DragonRuntime({}, new FakeMixer());
  runtime.bindClips(clips);
  runtime.updateFromFlight(flight({ mode: "takeoff", speed: 8 }));
  assert.equal(runtime.telemetry.state, "takeoff");

  runtime.update(0.64);
  runtime.updateFromFlight(flight({ speed: 24 }));
  assert.equal(runtime.telemetry.state, "takeoff", "takeoff pose holds before 0.65 seconds");
  assert.equal(runtime.telemetry.heldState, true);

  runtime.update(0.01);
  runtime.updateFromFlight(flight({ speed: 24 }));
  assert.equal(runtime.telemetry.state, "flight", "takeoff pose releases at the exact hold boundary");
  assert.equal(runtime.telemetry.heldState, false);
}

{
  const runtime = new DragonRuntime({}, new FakeMixer());
  runtime.bindClips(clips);
  runtime.updateFromFlight(flight({ landingRequested: true, mode: "landing", speed: 12 }));
  runtime.update(0.44);
  runtime.updateFromFlight(flight({ speed: 18 }));
  assert.equal(runtime.telemetry.state, "landing");
  assert.equal(runtime.telemetry.heldState, true);
  runtime.update(0.01);
  runtime.updateFromFlight(flight({ speed: 18 }));
  assert.equal(runtime.telemetry.state, "flight");
}

{
  const runtime = new DragonRuntime({}, new FakeMixer());
  runtime.bindClips(clips);
  runtime.updateFromFlight(flight({ mode: "recovery", speed: 5 }));
  runtime.update(0.69);
  runtime.updateFromFlight(flight({ speed: 16 }));
  assert.equal(runtime.telemetry.state, "recovery");
  runtime.update(0.01);
  runtime.updateFromFlight(flight({ speed: 16 }));
  assert.equal(runtime.telemetry.state, "flight");
}

{
  const runtime = new DragonRuntime({}, new FakeMixer());
  runtime.bindClips(clips);
  runtime.updateFromFlight(flight({ bank: 0.43 }));
  assert.equal(runtime.telemetry.state, "turn");
  runtime.updateFromFlight(flight({ bank: 0.25 }));
  assert.equal(runtime.telemetry.state, "turn", "turn remains active inside its hysteresis band");
  runtime.updateFromFlight(flight({ bank: 0.23 }));
  assert.equal(runtime.telemetry.state, "flight", "turn releases below its hysteresis band");

  runtime.updateFromFlight(flight({ speed: 45 }));
  assert.equal(runtime.telemetry.state, "glide");
  runtime.updateFromFlight(flight({ speed: 39 }));
  assert.equal(runtime.telemetry.state, "glide", "glide remains active inside its speed hysteresis band");
  runtime.updateFromFlight(flight({ speed: 38 }));
  assert.equal(runtime.telemetry.state, "flight", "glide releases at the lower threshold");
}

{
  const runtime = new DragonRuntime({}, null);
  runtime.bindClips([]);
  const clip = runtime.updateFromFlight({ airborne: true, speed: 20, bank: 0 });
  assert.equal(clip, null);
  assert.ok(runtime.telemetry.missing.includes("flight"));
}

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);
  runtime.bindClips([]);
  runtime.updateFromFlight(flight());
  assert.ok(runtime.telemetry.missing.includes("flight"));
  const rebound = runtime.bindClips(clips);
  assert.deepEqual(rebound, clips.map(({ name }) => name.toLowerCase()));
  assert.equal(runtime.telemetry.state, "grounded-idle");
  assert.equal(runtime.telemetry.clip, "Dragon_Idle_Sentinel_v44");
  assert.deepEqual(runtime.telemetry.missing, [], "rebinding a valid production set clears stale missing-role telemetry");
}

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);
  runtime.bindClips(clips);
  runtime.updateFromFlight(flight({ mode: "takeoff", speed: 8 }));
  const readiness = mixer.actions.get("Dragon_Wing_Readiness_Test");
  assert.ok(readiness.calls.some(([name, value]) => name === "fadeIn" && value === 0.18));
  assert.ok(readiness.calls.some(([name, value]) => name === "rate" && value === 1.35));
  runtime.update(0.65);
  runtime.updateFromFlight(flight({ speed: 10000 }));
  assert.equal(runtime.telemetry.playbackRate, 1.55, "powered-flight rate clamps at the production ceiling");
  runtime.updateFromFlight(flight({ speed: -10000 }));
  assert.equal(runtime.telemetry.playbackRate, 0.78, "powered-flight rate clamps at the production floor");
}

{
  const mixer = new FakeMixer();
  const runtime = new DragonRuntime({}, mixer);
  runtime.bindClips(clips);
  runtime.update(Number.NaN);
  runtime.update(-1);
  runtime.update(0);
  assert.equal(runtime.telemetry.stateAge, 0, "invalid delta times cannot age or destabilize a runtime state");
  assert.deepEqual(mixer.updates, []);
}

console.log("dragon-runtime tests passed");