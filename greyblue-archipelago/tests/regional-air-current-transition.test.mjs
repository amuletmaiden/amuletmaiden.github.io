import assert from "node:assert/strict";
import {
  createRegionalAirCurrentTransition,
  stepRegionalAirCurrentTransition,
  regionalAirCurrentTransitionPublicState,
} from "../src/flight/regional-air-current.js";

const EPS = 1e-9;

function near(a, b, epsilon = EPS) {
  assert.ok(Math.abs(a - b) <= epsilon, `${a} !~= ${b}`);
}

{
  const start = createRegionalAirCurrentTransition({ x: 1.5, z: -2 });
  assert.deepEqual(start, { x: 1.5, z: -2, transitioning: false });
  assert.deepEqual(regionalAirCurrentTransitionPublicState(start), { active: true, transitioning: false });
}

{
  const state = createRegionalAirCurrentTransition();
  const target = Object.freeze({ x: 4, z: -1 });
  const next = stepRegionalAirCurrentTransition({ state, targetCurrent: target, dt: 1 / 60 });
  assert.ok(next.x > 0 && next.x < target.x);
  assert.ok(next.z < 0 && next.z > target.z);
  assert.equal(next.transitioning, true);
  assert.deepEqual(target, { x: 4, z: -1 });
}

{
  let state = createRegionalAirCurrentTransition({ x: -4, z: 2 });
  const target = { x: 3.5, z: -3 };
  let priorDistance = Math.hypot(target.x - state.x, target.z - state.z);
  for (let i = 0; i < 600; i += 1) {
    state = stepRegionalAirCurrentTransition({ state, targetCurrent: target, dt: 1 / 60 });
    const distance = Math.hypot(target.x - state.x, target.z - state.z);
    assert.ok(distance <= priorDistance + EPS);
    assert.ok(state.x >= -4 - EPS && state.x <= 3.5 + EPS);
    assert.ok(state.z <= 2 + EPS && state.z >= -3 - EPS);
    priorDistance = distance;
  }
  near(state.x, target.x);
  near(state.z, target.z);
  assert.equal(state.transitioning, false);
}

{
  const base = createRegionalAirCurrentTransition({ x: 1, z: 1 });
  const zeroDt = stepRegionalAirCurrentTransition({ state: base, targetCurrent: { x: 3, z: 2 }, dt: -9 });
  assert.deepEqual(zeroDt, { x: 1, z: 1, transitioning: true });

  const hugeDt = stepRegionalAirCurrentTransition({ state: base, targetCurrent: { x: 3, z: 2 }, dt: 99 });
  const clampedDt = stepRegionalAirCurrentTransition({ state: base, targetCurrent: { x: 3, z: 2 }, dt: 0.1 });
  near(hugeDt.x, clampedDt.x);
  near(hugeDt.z, clampedDt.z);
}

{
  const interrupted = stepRegionalAirCurrentTransition({
    state: { x: 3, z: -2, transitioning: true },
    targetCurrent: { x: -4, z: 4 },
    dt: 0.05,
    interrupted: true,
  });
  assert.deepEqual(interrupted, { x: 0, z: 0, transitioning: false });
  assert.deepEqual(regionalAirCurrentTransitionPublicState(interrupted), { active: false, transitioning: false });
}

{
  const malformed = stepRegionalAirCurrentTransition({
    state: { x: Number.NaN, z: Infinity },
    targetCurrent: { x: "nope", z: null },
    dt: Number.NaN,
  });
  assert.deepEqual(malformed, { x: 0, z: 0, transitioning: false });
  assert.deepEqual(Object.keys(regionalAirCurrentTransitionPublicState(malformed)).sort(), ["active", "transitioning"]);
}

console.log("regional-air-current-transition regressions: ok");
