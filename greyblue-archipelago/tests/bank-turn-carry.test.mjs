import assert from "node:assert/strict";
import { deriveBankTurnCarry } from "../src/flight/bank-turn-carry.js";

const base = {
  airborne: true,
  landingRequested: false,
  takeoffActive: false,
  stallPressure: 0,
  steer: 0,
  bank: 0.55,
  planarSpeed: 48,
};

const rightCarry = deriveBankTurnCarry(base);
assert.ok(rightCarry > 0, "committed right bank carries a small right turn after steer release");
assert.ok(rightCarry <= 0.22, "turn carry stays bounded");

const leftCarry = deriveBankTurnCarry({ ...base, bank: -0.55 });
assert.ok(leftCarry < 0, "left bank carries the same-sign left turn");
assert.ok(Math.abs(leftCarry + rightCarry) < 1e-12, "left/right carry is symmetric");

assert.equal(
  deriveBankTurnCarry({ ...base, steer: -0.2 }),
  0,
  "explicit opposite steering takes authority immediately",
);
assert.equal(
  deriveBankTurnCarry({ ...base, steer: 0.2 }),
  0,
  "explicit same-sign steering uses ordinary turn authority without hidden carry",
);
assert.equal(
  deriveBankTurnCarry({ ...base, bank: 0.08 }),
  0,
  "shallow residual bank does not create a turn",
);
assert.equal(
  deriveBankTurnCarry({ ...base, planarSpeed: 18 }),
  0,
  "low-speed flight does not receive carry",
);
assert.equal(
  deriveBankTurnCarry({ ...base, airborne: false }),
  0,
  "grounded state is neutral",
);
assert.equal(
  deriveBankTurnCarry({ ...base, landingRequested: true }),
  0,
  "landing final approach is neutral",
);
assert.equal(
  deriveBankTurnCarry({ ...base, takeoffActive: true }),
  0,
  "takeoff transient is neutral",
);
assert.equal(
  deriveBankTurnCarry({ ...base, stallPressure: 0.1 }),
  0,
  "stall pressure is neutral",
);

const medium = Math.abs(deriveBankTurnCarry({ ...base, bank: 0.35 }));
const strong = Math.abs(deriveBankTurnCarry({ ...base, bank: 0.65 }));
assert.ok(strong > medium && medium > 0, "carry rises smoothly with meaningful bank");

const slower = Math.abs(deriveBankTurnCarry({ ...base, planarSpeed: 30 }));
const faster = Math.abs(deriveBankTurnCarry({ ...base, planarSpeed: 52 }));
assert.ok(faster > slower && slower > 0, "carry rises smoothly with useful airspeed");

for (const malformed of [
  { steer: Number.NaN },
  { bank: Number.POSITIVE_INFINITY },
  { planarSpeed: Number.NaN },
  { stallPressure: Number.NaN },
]) {
  assert.equal(deriveBankTurnCarry({ ...base, ...malformed }), 0, "malformed state fails neutral");
}

console.log("bank turn carry tests passed");
