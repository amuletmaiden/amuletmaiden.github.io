import assert from 'node:assert/strict';
import { deriveLandingApproach } from '../src/interface/live-landing-approach-model.js';

function state(overrides = {}) {
  return {
    position: { x: 0, y: 80, z: 0 },
    flight: { airborne: true, landingRequested: false, yaw: 0, speed: 60 },
    surface: { height: 10 },
    nearestIsland: {
      id: 'isle-a',
      name: 'Mothglass Isle',
      landingZone: { x: 0, z: 300, distance: 300 },
    },
    ...overrides,
  };
}

{
  const view = deriveLandingApproach({ position: { y: 20 }, surface: { height: 0 } });
  assert.equal(view.visible, false);
  assert.equal(view.phase, 'none');
}

{
  const view = deriveLandingApproach(state());
  assert.equal(view.visible, true);
  assert.equal(view.phase, 'approach');
  assert.equal(view.bearing.direction, 'ahead');
  assert.match(view.advice, /Landing zone ahead/);
}

{
  const view = deriveLandingApproach(state({
    flight: { airborne: true, landingRequested: false, yaw: Math.PI / 2, speed: 60 },
  }));
  assert.equal(view.bearing.direction, 'left');
  assert.ok(view.bearing.degrees >= 80 && view.bearing.degrees <= 100);
}

{
  const view = deriveLandingApproach(state({
    flight: { airborne: true, landingRequested: true, yaw: 0, speed: 92 },
    nearestIsland: { id: 'isle-a', name: 'Mothglass Isle', landingZone: { x: 0, z: 180, distance: 180 } },
  }));
  assert.equal(view.phase, 'final');
  assert.match(view.advice, /Bleed speed/);
}

{
  const view = deriveLandingApproach(state({
    position: { x: 0, y: 28, z: 0 },
    flight: { airborne: true, landingRequested: true, yaw: 0, speed: 42 },
    surface: { height: 10 },
    nearestIsland: { id: 'isle-a', name: 'Mothglass Isle', landingZone: { x: 0, z: 70, distance: 70 } },
  }));
  assert.equal(view.phase, 'flare');
  assert.match(view.advice, /Ease down|Hold the flare/);
}

{
  const view = deriveLandingApproach(state({
    flight: { airborne: false, landingRequested: false, yaw: 0, speed: 0 },
    nearestIsland: { id: 'isle-a', name: 'Mothglass Isle', landingZone: { x: 0, z: 12, distance: 12 } },
  }));
  assert.equal(view.phase, 'landed');
  assert.equal(view.advice, 'Touchdown complete.');
}

{
  const view = deriveLandingApproach(state({
    position: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NaN },
    flight: { airborne: true, landingRequested: true, yaw: Number.NaN, speed: Number.POSITIVE_INFINITY },
    surface: { height: Number.NaN },
    nearestIsland: { id: 'isle-a', name: 'Mothglass Isle', landingZone: { x: Number.NaN, z: Number.NaN, distance: Number.NaN } },
  }));
  assert.ok(Number.isFinite(view.distance));
  assert.ok(Number.isFinite(view.clearance));
  assert.ok(Number.isFinite(view.speed));
}

{
  const input = state();
  const snapshot = JSON.stringify(input);
  deriveLandingApproach(input);
  assert.equal(JSON.stringify(input), snapshot);
}

{
  const view = deriveLandingApproach(state());
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.bearing), true);
  assert.doesNotThrow(() => JSON.stringify(view));
}

console.log('live landing approach model tests passed');
