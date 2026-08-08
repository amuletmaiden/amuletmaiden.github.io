import assert from 'node:assert/strict';
import { listRouteChoices, cycleRouteChoice, traversedRouteIdsFromExploration } from '../src/core/route-choice.js';

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
  listRouteChoices({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: [] }).map((entry) => entry.routeId),
  ['r1', 'r2'],
  'untraversed choices retain stable destination ordering',
);

assert.deepEqual(
  listRouteChoices({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: ['r1'] }).map((entry) => [entry.routeId, entry.traversed]),
  [['r2', false], ['r1', true]],
  'untraversed routes sort ahead of familiar routes',
);

assert.deepEqual(
  listRouteChoices({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: ['r1', 'r2'] }).map((entry) => entry.routeId),
  ['r1', 'r2'],
  'all-traversed fallback preserves stable ordering',
);

assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1'], traversedRouteIds: [], preferredRouteId: null }).preferredRouteId, 'r1');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: ['r1'], preferredRouteId: null }).preferredRouteId, 'r2');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: ['r1'], preferredRouteId: 'r2' }).preferredRouteId, 'r1');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: ['r1'], preferredRouteId: 'missing' }).familiarity, 'unfamiliar');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: [], traversedRouteIds: ['r1'], preferredRouteId: 'r1' }).reason, 'no-eligible-routes');
assert.equal(cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: ['r1', 'r2'], traversedRouteIds: [], preferredRouteId: 'r1', activeCrossingRouteId: 'r1' }).reason, 'active-crossing');

assert.deepEqual(
  traversedRouteIdsFromExploration({
    events: [
      { kind: 'route-completed', id: 'r2', routeId: 'r2' },
      { kind: 'route-completed', id: 'r2', routeId: 'r2' },
      { kind: 'landmark-investigated', id: 'r1', routeId: 'r1' },
      { kind: 'route-completed', id: 'bad', routeId: '   ' },
      null,
    ],
  }),
  ['r2', 'bad'],
  'restored traversal history accepts only route-completed events and deduplicates IDs',
);
assert.deepEqual(traversedRouteIdsFromExploration(null), []);

const routesBefore = world.routes.map((route) => ({ ...route }));
const traversedBefore = new Set(['r1']);
cycleRouteChoice({ world, islandId: 'a', discoveredRouteIds: new Set(['r1', 'r2']), traversedRouteIds: traversedBefore, preferredRouteId: 'r2' });
assert.deepEqual(world.routes, routesBefore, 'caller world metadata remains unchanged');
assert.deepEqual([...traversedBefore], ['r1'], 'caller traversal history remains unchanged');

assert.deepEqual(listRouteChoices({ world: null, islandId: 'a', discoveredRouteIds: ['r1'], traversedRouteIds: [] }), []);
assert.deepEqual(listRouteChoices({ world: { routes: [{}], islands: [] }, islandId: 'a', discoveredRouteIds: [''], traversedRouteIds: [] }), []);

console.log('route-choice tests passed');
