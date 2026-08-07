import assert from 'node:assert/strict';
import { listRouteChoices, cycleRouteChoice } from '../src/core/route-choice.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'a', name: 'Aster' }),
    Object.freeze({ id: 'b', name: 'Blue Reach' }),
    Object.freeze({ id: 'c', name: 'Cinder' }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: 'r2', fromIslandId: 'a', toIslandId: 'c' }),
    Object.freeze({ id: 'r1', fromIslandId: 'a', toIslandId: 'b' }),
    Object.freeze({ id: 'r3', fromIslandId: 'b', toIslandId: 'c' }),
  ]),
});

assert.deepEqual(
  listRouteChoices({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'] }).map((entry) => entry.routeId),
  ['r1', 'r2'],
  'choices are stable and destination-sorted',
);

assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1'], preferredRouteId: null }).preferredRouteId, 'r1');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], preferredRouteId: 'r1' }).preferredRouteId, 'r2');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], preferredRouteId: 'missing' }).preferredRouteId, 'r1');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: [], preferredRouteId: 'r1' }).reason, 'no-eligible-routes');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], preferredRouteId: 'r1', activeCrossingRouteId: 'r1' }).reason, 'active-crossing');

const routesBefore = world.routes.map((route) => ({ ...route }));
cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: new Set(['r1', 'r2']), preferredRouteId: 'r2' });
assert.deepEqual(world.routes, routesBefore, 'caller world metadata remains unchanged');

assert.deepEqual(listRouteChoices({ world: null, islandId: 'a', discoveredRouteIds: ['r1'] }), []);
assert.deepEqual(listRouteChoices({ world: { routes: [{}], islands: [] }, islandId: 'a', discoveredRouteIds: [''] }), []);

console.log('route-choice tests passed');
