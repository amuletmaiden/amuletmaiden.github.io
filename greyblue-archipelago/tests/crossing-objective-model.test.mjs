import assert from 'node:assert/strict';
import { createCrossingObjectiveModel } from '../src/core/crossing-objective-model.js';

const world = {
  islands: [
    { id: 'a', name: 'A', x: 0, z: 0 },
    { id: 'b', name: 'The Far Bell', x: 2000, z: 0 },
  ],
};

const guidance = {
  routeId: 'route:a:b',
  destinationIslandId: 'b',
  destinationName: 'The Far Bell',
  distance: 2000,
  remainingDistance: 2000,
  minimumAltitude: 120,
  fogRisk: { level: 'high' },
};

{
  const model = createCrossingObjectiveModel();
  const start = model.update({ guidance, position: { x: 0, y: 140, z: 0 }, yaw: Math.PI / 2, world });
  assert.equal(start.visible, true);
  assert.equal(start.destinationName, 'The Far Bell');
  assert.equal(start.phase, 'departure');
  assert.equal(start.turn, 'ahead');

  const committed = model.update({ guidance: null, position: { x: 900, y: 140, z: 0 }, yaw: Math.PI / 2, world });
  assert.equal(committed.visible, true, 'objective persists after app route guidance disappears');
  assert.equal(committed.phase, 'crossing');
  assert.ok(committed.progress > 0.4 && committed.progress < 0.5);

  const approach = model.update({ guidance: null, position: { x: 1450, y: 90, z: 0 }, yaw: Math.PI / 2, world });
  assert.equal(approach.phase, 'approach');
  assert.match(approach.altitudeAdvice, /^climb /);
  assert.equal(approach.fogRisk, 'high');

  const arrived = model.update({ guidance: null, position: { x: 1900, y: 140, z: 0 }, yaw: Math.PI / 2, world });
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.phase, 'arrived');
  assert.equal(model.snapshot().completedRouteIds.includes('route:a:b'), true);
  assert.equal(model.clearArrival(), true);
  assert.equal(model.snapshot().activeRouteId, null);
}

{
  const model = createCrossingObjectiveModel();
  const idle = model.update({ guidance: { routeId: 'broken', destinationIslandId: 'missing' }, position: {}, world });
  assert.equal(idle.visible, false);
  assert.doesNotThrow(() => JSON.stringify(idle));
  assert.equal(Object.isFrozen(idle), true);
}

{
  const model = createCrossingObjectiveModel({ arrivalRadius: Number.NaN });
  model.update({ guidance, position: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: null }, yaw: Number.NaN, world });
  const snapshot = model.snapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.equal(Object.isFrozen(snapshot), true);
}

{
  const model = createCrossingObjectiveModel();
  model.update({ guidance, position: { x: 0, y: 140, z: 0 }, world });
  assert.equal(model.cancel(), 'route:a:b');
  assert.equal(model.snapshot().activeRouteId, null);
}
