import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dragon/runtime.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { DragonRuntime } = await import(moduleUrl);

class Action {
  constructor(name, failOnce = false) { this.name = name; this.failOnce = failOnce; }
  reset() { return this; }
  setEffectiveWeight() { return this; }
  setEffectiveTimeScale() { return this; }
  fadeIn() { return this; }
  fadeOut() { return this; }
  play() {
    if (this.failOnce) { this.failOnce = false; throw new Error(`${this.name} failed once`); }
    return this;
  }
}

const idle = { name: "Dragon_Idle_Sentinel_v44" };
const flight = { name: "Dragon_Flight" };
const glide = { name: "Dragon_Glide" };
const actions = new Map([
  [idle.name, new Action(idle.name)],
  [flight.name, new Action(flight.name, true)],
  [glide.name, new Action(glide.name)],
]);
const runtime = new DragonRuntime({}, { clipAction: (clip) => actions.get(clip.name), update() {} });
runtime.bindClips([idle, flight, glide]);

const snapshots = [];
const record = () => snapshots.push({
  state: runtime.telemetry.state,
  clip: runtime.telemetry.clip,
  activeClip: runtime.telemetry.activeClip,
  fallbackReason: runtime.telemetry.fallbackReason,
  actionFailure: runtime.telemetry.actionFailure?.reason ?? null,
  transitionCount: runtime.telemetry.transitionCount,
  heldState: runtime.telemetry.heldState,
});
record();

runtime.updateFromFlight({ airborne: true, speed: 30, bank: 0 });
record();
assert.equal(runtime.telemetry.fallbackReason, "action-error");
assert.equal(runtime.telemetry.activeClip, idle.name);
assert.equal(runtime.telemetry.transitionCount, 1);

runtime.updateFromFlight({ airborne: true, speed: 30, bank: 0 });
record();
assert.equal(runtime.telemetry.fallbackReason, null);
assert.equal(runtime.telemetry.actionFailure, null);
assert.equal(runtime.telemetry.activeClip, flight.name);
assert.equal(runtime.telemetry.transitionCount, 2);

runtime.updateFromFlight({ airborne: true, speed: 50, bank: 0 });
record();
assert.equal(runtime.telemetry.state, "glide");
assert.equal(runtime.telemetry.activeClip, glide.name);
assert.equal(runtime.telemetry.transitionCount, 3);

runtime.updateFromFlight({ airborne: true, speed: 39, bank: 0 });
record();
assert.equal(runtime.telemetry.state, "glide");
assert.equal(runtime.telemetry.transitionCount, 3);

runtime.updateFromFlight({ airborne: true, speed: 37, bank: 0 });
record();
assert.equal(runtime.telemetry.state, "flight");
assert.equal(runtime.telemetry.transitionCount, 4);

assert.deepEqual(snapshots.map((entry) => entry.transitionCount), [1, 1, 2, 3, 3, 4]);
assert.deepEqual(snapshots.map((entry) => entry.fallbackReason), [null, "action-error", null, null, null, null]);
assert(snapshots.every((entry) => typeof entry.state === "string"));
assert.doesNotThrow(() => JSON.stringify(snapshots));

console.log("dragon runtime telemetry contract tests passed");