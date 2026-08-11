import assert from 'node:assert/strict';
import { buildKnownVoyageChart } from '../src/interface/known-voyage-chart.js';

const world = Object.freeze({
  regions: Object.freeze([
    Object.freeze({ id: 'reach', name: 'The Reach' }),
    Object.freeze({ id: 'crown', name: 'The Crown' }),
  ]),
  islands: Object.freeze([
    Object.freeze({
      id: 'a', name: 'Aster', regionId: 'reach', regionName: 'The Reach', x: -100, z: 20,
      landmarkRecord: Object.freeze({ id: 'a:landmark' }),
    }),
    Object.freeze({
      id: 'b', name: 'Bell', regionId: 'reach', regionName: 'The Reach', x: 200, z: 120,
      landmarkRecord: null,
    }),
    Object.freeze({
      id: 'secret', name: 'Secret Isle', regionId: 'crown', regionName: 'The Crown', x: 9000, z: -9000,
      landmarkRecord: Object.freeze({ id: 'secret:landmark' }),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: 'route:known', kind: 'regional-chain', fromIslandId: 'a', toIslandId: 'b' }),
    Object.freeze({ id: 'route:leak', kind: 'far-ring', fromIslandId: 'b', toIslandId: 'secret' }),
  ]),
});

const exploration = Object.freeze({
  events: Object.freeze([
    Object.freeze({ kind: 'route-completed', id: 'route:known', routeId: 'route:known', occurredAt: 10 }),
    Object.freeze({ kind: 'route-completed', id: 'route:leak', routeId: 'route:leak', occurredAt: 20 }),
    Object.freeze({ kind: 'roost-established', id: 'a:landing-0', islandId: 'a', landingZoneId: 'a:landing-0', occurredAt: 30 }),
    Object.freeze({ kind: 'landmark-investigated', id: 'a:landmark', landmarkId: 'a:landmark', occurredAt: 40 }),
    Object.freeze({ kind: 'landmark-investigated', id: 'secret:landmark', landmarkId: 'secret:landmark', occurredAt: 50 }),
  ]),
});

const beforeWorld = JSON.stringify(world);
const beforeExploration = JSON.stringify(exploration);
const chart = buildKnownVoyageChart({
  world,
  discoveredIslandIds: ['a', 'b'],
  discoveredRouteIds: ['route:known', 'route:leak'],
  exploration,
  currentRegionId: 'reach',
});

assert.equal(chart.available, true);
assert.deepEqual(chart.nodes.map((node) => node.id).sort(), ['a', 'b']);
assert.deepEqual(chart.edges.map((edge) => edge.id), ['route:known']);
assert.equal(JSON.stringify(chart).includes('Secret Isle'), false);
assert.equal(JSON.stringify(chart).includes('secret:landmark'), false);
assert.equal(JSON.stringify(chart).includes('9000'), false);
assert.equal(chart.nodes.find((node) => node.id === 'a')?.roost, true);
assert.equal(chart.nodes.find((node) => node.id === 'a')?.investigatedLandmark, true);
assert.equal(chart.nodes.every((node) => node.currentRegion), true);
assert.equal(chart.edges[0]?.completed, true);
assert.ok(chart.nodes.every((node) => node.x >= 0.08 && node.x <= 0.92 && node.y >= 0.08 && node.y <= 0.92));
assert.ok(chart.text.some((line) => line.includes('Aster to Bell: completed passage.')));
assert.equal(chart.text.some((line) => /-?\d+(?:\.\d+)?/.test(line)), false);
assert.equal(JSON.stringify(world), beforeWorld);
assert.equal(JSON.stringify(exploration), beforeExploration);

const stable = buildKnownVoyageChart({
  world,
  discoveredIslandIds: ['b', 'a', 'b'],
  discoveredRouteIds: ['route:known'],
  exploration,
  currentRegionId: 'reach',
});
assert.deepEqual(chart.nodes, stable.nodes);
assert.deepEqual(chart.edges, stable.edges);
assert.deepEqual(chart.text, stable.text);

const hiddenOnly = buildKnownVoyageChart({
  world,
  discoveredIslandIds: [],
  discoveredRouteIds: ['route:known', 'route:leak'],
  exploration,
  currentRegionId: 'reach',
});
assert.deepEqual(hiddenOnly, { available: false, nodes: [], edges: [], text: [] });

const malformed = buildKnownVoyageChart({
  world: { islands: [{ id: 'bad', name: 'Bad', x: NaN, z: 0 }], routes: 'nope' },
  discoveredIslandIds: ['bad', null, 4],
  discoveredRouteIds: 'nope',
  exploration: { events: [null, { kind: 'route-completed', id: '' }] },
});
assert.equal(malformed.available, false);
assert.deepEqual(malformed.nodes, []);
assert.deepEqual(malformed.edges, []);
assert.deepEqual(malformed.text, []);

console.log('known-voyage-chart regressions: ok');
