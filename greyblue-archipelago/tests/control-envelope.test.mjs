import assert from "node:assert/strict";
import {
  createControlEnvelopeState,
  stepControlEnvelope,
} from "../src/flight/control-envelope.js";

function step(state, input, flight = {}, dt = 0.05, config = {}) {
  return stepControlEnvelope(state, input, {
    airborne: true,
    airspeed: 28,
    bank: 0,
    stallPressure: 0,
    landingRequested: false,
    ...flight,
  }, dt, config);
}

{
  const initial = createControlEnvelopeState();
  const keyboard = step(initial, { roll: 1, yaw: 0, throttle: 1 });
  const gamepad = step(initial, { roll: 1, yaw: 0, throttle: 1 });
  assert.deepEqual(keyboard.commands, gamepad.commands);
}

{
  let state = createControlEnvelopeState();
  for (let index = 0; index < 8; index += 1) {
    state = step(state, { roll: -1, yaw: 0, throttle: 0 }).state;
  }
  const reversed = step(state, { roll: 1, yaw: 0, throttle: 0 });
  assert.ok(reversed.commands.roll > -1);
  assert.ok(reversed.commands.roll < 1);
}

{
  const state = createControlEnvelopeState();
  const coordinated = step(state, { roll: 0.7, yaw: 0, throttle: 0.4 }, { bank: 0.7, airspeed: 35 });
  const counter = step(state, { roll: 0.7, yaw: -1, throttle: 0.4 }, { bank: 0.7, airspeed: 35 });
  assert.ok(coordinated.telemetry.coordinationAuthority > 0);
  assert.ok(Math.abs(counter.telemetry.coordinationAuthority) < Math.abs(coordinated.telemetry.coordinationAuthority));
  assert.ok(counter.commands.yaw < 0);
}

{
  let state = createControlEnvelopeState({ throttleCommand: -1 });
  const result = step(state, { roll: 0, yaw: 0, throttle: -1 }, {
    stallPressure: 0.9,
    landingRequested: false,
  });
  assert.equal(result.state.recoveryEngaged, true);
  assert.ok(result.commands.throttle >= 0.26);
}

{
  let state = createControlEnvelopeState({ throttleCommand: -1, recoveryEngaged: true });
  const result = step(state, { roll: 0, yaw: 0, throttle: -1 }, {
    stallPressure: 1,
    landingRequested: true,
  });
  assert.equal(result.state.recoveryEngaged, false);
  assert.ok(result.commands.throttle < 0);
  assert.equal(result.telemetry.mode, "landing");
}

{
  const input = Object.freeze({ roll: 0.3, yaw: -0.2, throttle: 0.6 });
  const flight = Object.freeze({
    airborne: true,
    airspeed: 30,
    bank: -0.5,
    stallPressure: 0.1,
    landingRequested: false,
  });
  const state = Object.freeze(createControlEnvelopeState());
  const before = JSON.stringify({ input, flight, state });
  stepControlEnvelope(state, input, flight, 0.05, { rollRiseRate: Number.NaN });
  assert.equal(JSON.stringify({ input, flight, state }), before);
}

{
  const result = stepControlEnvelope(
    { rollCommand: Number.NaN, throttleCommand: Infinity },
    { roll: Number.NaN, yaw: Infinity, throttle: -Infinity },
    { airborne: true, airspeed: Number.NaN, bank: Infinity, stallPressure: Number.NaN },
    Number.NaN,
    { rollRiseRate: -2, coordinationGain: Infinity },
  );
  for (const value of Object.values(result.commands)) assert.ok(Number.isFinite(value));
  assert.equal(result.state.recoveryEngaged, false);
}

console.log("control-envelope: ok");
