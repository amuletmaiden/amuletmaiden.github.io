import assert from "node:assert/strict";
import test from "node:test";
import {
  TAKEOFF_LIFT_DURATION,
  advanceTakeoffLiftElapsed,
  deriveTakeoffLift,
} from "../src/flight/takeoff-lift.js";

test("truthful takeoff begins with strong but bounded upward authority", () => {
  const lift = deriveTakeoffLift({ active: true, elapsed: 0 });
  assert.ok(lift >= 10 && lift <= 12);
});

test("takeoff lift decays smoothly and clears after the bounded release", () => {
  const early = deriveTakeoffLift({ active: true, elapsed: 0.08 });
  const middle = deriveTakeoffLift({ active: true, elapsed: 0.24 });
  const late = deriveTakeoffLift({ active: true, elapsed: 0.42 });
  assert.ok(early > middle && middle > late && late > 0);
  assert.equal(deriveTakeoffLift({ active: true, elapsed: TAKEOFF_LIFT_DURATION }), 0);
  assert.equal(deriveTakeoffLift({ active: true, elapsed: 4 }), 0);
});

test("inactive and malformed state fail neutral", () => {
  assert.equal(deriveTakeoffLift({ active: false, elapsed: 0 }), 0);
  assert.equal(deriveTakeoffLift({ active: true, elapsed: Number.NaN }), 0);
  assert.equal(deriveTakeoffLift({ active: true, elapsed: -1 }), 0);
});

test("elapsed integration clamps ordinary frames and cannot prolong release", () => {
  assert.equal(advanceTakeoffLiftElapsed({ active: true, elapsed: 0, dt: 2 }), 0.05);
  assert.equal(advanceTakeoffLiftElapsed({ active: true, elapsed: 0.2, dt: Number.NaN }), 0.2);
  assert.equal(
    advanceTakeoffLiftElapsed({ active: true, elapsed: TAKEOFF_LIFT_DURATION - 0.01, dt: 0.05 }),
    TAKEOFF_LIFT_DURATION,
  );
});

test("inactive or broken history resolves to completed release", () => {
  assert.equal(advanceTakeoffLiftElapsed({ active: false, elapsed: 0, dt: 0.016 }), TAKEOFF_LIFT_DURATION);
  assert.equal(advanceTakeoffLiftElapsed({ active: true, elapsed: Number.NaN, dt: 0.016 }), TAKEOFF_LIFT_DURATION);
});
