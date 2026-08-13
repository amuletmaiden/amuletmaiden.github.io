import assert from "node:assert/strict";
import { deriveRegionalAirCurrentAtmosphere, regionalAirCurrentAtmospherePublicState } from "../src/core/regional-air-current-atmosphere.js";

const base = Object.freeze({
  ready: true,
  paused: false,
  reducedMotion: false,
  flight: Object.freeze({ airborne: true, landingRequested: false, speed: 42, stallFactor: 0 }),
  collision: Object.freeze({ grounded: false, requiresRecovery: false }),
});

for (const current of [{ x: 3, z: 0 }, { x: -2, z: 1 }, { x: 0, z: -4.2 }]) {
  const cue = deriveRegionalAirCurrentAtmosphere({ ...base, airCurrent: current });
  assert.equal(cue.active, true);
  assert.ok(cue.intensity >= 0.24 && cue.intensity <= 1);
  assert.ok(Math.abs(Math.hypot(cue.directionX, cue.directionZ) - 1) < 1e-9);
  assert.deepEqual(regionalAirCurrentAtmospherePublicState(cue), { active: true });
}

const suppressed = [
  { ready: false },
  { paused: true },
  { reducedMotion: true },
  { flight: { ...base.flight, airborne: false } },
  { flight: { ...base.flight, landingRequested: true } },
  { flight: { ...base.flight, speed: 23.99 } },
  { flight: { ...base.flight, stallFactor: 0.36 } },
  { collision: { grounded: true, requiresRecovery: false } },
  { collision: { grounded: false, requiresRecovery: true } },
];
for (const override of suppressed) {
  const cue = deriveRegionalAirCurrentAtmosphere({ ...base, airCurrent: { x: 3, z: 0 }, ...override });
  assert.deepEqual(cue, { active: false, directionX: 0, directionZ: 0, intensity: 0 });
}

for (const current of [{ x: 0.1, z: 0.1 }, { x: Number.NaN, z: 2 }, null]) {
  assert.equal(deriveRegionalAirCurrentAtmosphere({ ...base, airCurrent: current }).active, false);
}

const source = { x: 2.4, z: -1.7 };
const before = JSON.stringify(source);
deriveRegionalAirCurrentAtmosphere({ ...base, airCurrent: source });
assert.equal(JSON.stringify(source), before);
assert.deepEqual(Object.keys(regionalAirCurrentAtmospherePublicState({ active: true })), ["active"]);

console.log(JSON.stringify({ status: "pass", suppressed: suppressed.length, publicKeys: ["active"] }));
