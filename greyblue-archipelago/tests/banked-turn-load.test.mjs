import assert from "node:assert/strict";
import test from "node:test";
import { deriveBankedTurnVerticalLoad } from "../src/flight/banked-turn-load.js";

test("straight and shallow flight preserve vertical parity", () => {
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: 0, planarSpeed: 60 }), 0);
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.15, planarSpeed: 60 }), 0);
});

test("low speed does not manufacture turn sink", () => {
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.72, planarSpeed: 14 }), 0);
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.72, planarSpeed: 8 }), 0);
});

test("meaningful bank and speed produce smooth bounded sink", () => {
  const moderate = deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.42, planarSpeed: 34 });
  const strong = deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.72, planarSpeed: 50 });
  assert.ok(moderate < 0 && moderate > -3.2);
  assert.ok(strong <= moderate);
  assert.equal(strong, -3.2);
});

test("left and right bank have identical load", () => {
  const left = deriveBankedTurnVerticalLoad({ airborne: true, bank: -0.55, planarSpeed: 42 });
  const right = deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.55, planarSpeed: 42 });
  assert.equal(left, right);
});

test("grounded and malformed inputs fail neutral", () => {
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: false, bank: 0.72, planarSpeed: 60 }), 0);
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: Number.NaN, planarSpeed: 60 }), 0);
  assert.equal(deriveBankedTurnVerticalLoad({ airborne: true, bank: 0.72, planarSpeed: Infinity }), 0);
});

test("load remains a small share of existing climb authority", () => {
  for (const bank of [-10, -1, -0.5, 0, 0.5, 1, 10]) {
    for (const speed of [0, 14, 20, 50, 1000]) {
      const sink = deriveBankedTurnVerticalLoad({ airborne: true, bank, planarSpeed: speed });
      assert.ok(sink <= 0);
      assert.ok(sink >= -3.2);
      assert.ok(17 + sink > 13.7, "full climb retains ample positive authority");
    }
  }
});
