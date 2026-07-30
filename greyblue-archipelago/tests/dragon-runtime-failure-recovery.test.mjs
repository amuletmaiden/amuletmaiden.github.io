import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dragon/runtime.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { DragonRuntime } = await import(moduleUrl);

class Action {
  constructor(name, failing = false) {
    this.name = name;
    this.failing = failing;
  }
  reset() { return this; }
  setEffectiveWeight() { return this; }
  setEffectiveTimeScale() { return this; }
  fadeIn() { return this; }
  fadeOut() { return this; }
  play() {
    if (this.failing) throw new Error(`${this.name} failed`);
    return this;
  }
}

const idle = { name: "Dragon_Idle_Sentinel_v44" };
const flight = { name: "Dragon_Flight_Broken" };
const glide = { name: "Dragon_Glide" };
const flightAction = new Action(flight.name, true);
const actions = new Map([
  [idle.name, new Action(idle.name)],
  [flight.name, flightAction],
  [glide.name, new Action(glide.name)],
]);
const runtime = new DragonRuntime({}, {
  clipAction(clip) { return actions.get(clip.name); },
  update() {},
});

runtime.bindClips([idle, flight, glide]);
runtime.updateFromFlight({ airborne: true, speed: 30, bank: 0 });
assert.equal(runtime.telemetry.fallbackReason, "action-error");
assert.equal(runtime.telemetry.actionFailure.reason, `${flight.name} failed`);
assert.equal(runtime.telemetry.activeClip, idle.name);

runtime.updateFromFlight({ airborne: true, mode: "glide", speed: 50, bank: 0 });
assert.equal(runtime.telemetry.activeClip, glide.name);
assert.equal(runtime.telemetry.actionFailure, null, "successful transition clears active failure telemetry");
assert.equal(runtime.telemetry.fallbackReason, null, "successful exact transition clears failure fallback state");
assert.equal(runtime.telemetry.fallback, false);

flightAction.failing = false;
runtime.updateFromFlight({ airborne: true, speed: 30, bank: 0 });
assert.equal(runtime.telemetry.activeClip, flight.name);
assert.equal(runtime.telemetry.actionFailure, null);
assert.equal(runtime.telemetry.fallbackReason, null);

console.log("dragon-runtime failure recovery tests passed");
