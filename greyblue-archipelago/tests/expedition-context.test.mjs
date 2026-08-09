import assert from 'node:assert/strict';
import { deriveExpeditionContext, expeditionJournalLine } from '../src/core/expedition-context.js';

const world = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'isle-a', regionId: 'reach' }),
    Object.freeze({ id: 'isle-b', regionId: 'reach', landmark: true }),
    Object.freeze({ id: 'isle-c', regionId: 'crown' }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: 'route-a-b', kind: 'regional-chain', fromIslandId: 'isle-a', toIslandId: 'isle-b' }),
    Object.freeze({ id: 'route-a-c', kind: 'far-ring', fromIslandId: 'isle-a', toIslandId: 'isle-c' }),
  ]),
});

const base = {
  world,
  discoveredIslandIds: ['isle-a', 'isle-b', 'isle-c'],
  discoveredRouteIds: ['route-a-b', 'route-a-c'],
  currentIslandId: 'isle-a',
};

{
  const context = deriveExpeditionContext(base);
  assert.equal(context.active, true);
  assert.equal(context.routeId, 'route-a-b');
  assert.equal(context.destinationIslandId, 'isle-b');
  assert.equal(context.phase, 'considering');
  assert.equal(context.familiar, false);
  assert.equal(context.purpose, 'landmark');
}

{
  const context = deriveExpeditionContext({
    ...base,
    exploration: { events: [
      { kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b', occurredAt: 1 },
      { kind: 'landmark-flight-encounter', id: 'isle-b:landmark', islandId: 'isle-b', occurredAt: 2 },
    ] },
  });
  assert.equal(context.routeId, 'route-a-c');
  assert.equal(context.purpose, 'frontier');
}

{
  const context = deriveExpeditionContext({
    world: {
      islands: [
        { id: 'a', regionId: 'r' },
        { id: 'b', regionId: 'r', landmarkRecord: { id: 'landmark-b' } },
        { id: 'c', regionId: 'r' },
      ],
      routes: [
        { id: 'ab', fromIslandId: 'a', toIslandId: 'b' },
        { id: 'ac', fromIslandId: 'a', toIslandId: 'c' },
      ],
    },
    discoveredIslandIds: ['a', 'b', 'c'],
    discoveredRouteIds: ['ab', 'ac'],
    currentIslandId: 'a',
    exploration: { events: [
      { kind: 'landmark-investigated', id: 'landmark-b', landmarkId: 'landmark-b', occurredAt: 1 },
    ] },
  });
  assert.equal(context.routeId, 'ab');
  assert.equal(context.purpose, 'frontier');
}

{
  const context = deriveExpeditionContext({
    ...base,
    discoveredIslandIds: ['isle-a', 'isle-b'],
    discoveredRouteIds: ['route-a-c'],
  });
  assert.deepEqual(context, { active: false, phase: 'idle', familiar: false });
}

{
  const context = deriveExpeditionContext({ ...base, committedRouteId: 'route-a-c' });
  assert.equal(context.routeId, 'route-a-c');
  assert.equal(context.phase, 'crossing');
}

{
  const context = deriveExpeditionContext({
    ...base,
    exploration: { events: [
      { kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b', occurredAt: 1 },
      { kind: 'route-completed', id: 'route-a-c', routeId: 'route-a-c', occurredAt: 2 },
      { kind: 'landmark-flight-encounter', id: 'isle-b:landmark', islandId: 'isle-b', occurredAt: 3 },
    ] },
  });
  assert.equal(context.routeId, 'route-a-b');
  assert.equal(context.phase, 'arrived');
  assert.equal(context.familiar, true);
  assert.equal(context.purpose, 'familiar');
}

const journeyWorld = Object.freeze({
  islands: Object.freeze([
    Object.freeze({ id: 'a', regionId: 'r1' }),
    Object.freeze({ id: 'b', regionId: 'r1' }),
    Object.freeze({ id: 'c', regionId: 'r2' }),
    Object.freeze({ id: 'd', regionId: 'r2', landmark: true }),
    Object.freeze({ id: 'roost', regionId: 'r3' }),
    Object.freeze({ id: 'hidden', regionId: 'secret', landmark: true }),
  ]),
  routes: Object.freeze([
    Object.freeze({ id: 'ab', fromIslandId: 'a', toIslandId: 'b' }),
    Object.freeze({ id: 'bc', fromIslandId: 'b', toIslandId: 'c' }),
    Object.freeze({ id: 'cd', fromIslandId: 'c', toIslandId: 'd' }),
    Object.freeze({ id: 'cr', fromIslandId: 'c', toIslandId: 'roost' }),
    Object.freeze({ id: 'ah', fromIslandId: 'a', toIslandId: 'hidden' }),
  ]),
});

const journeyBase = {
  world: journeyWorld,
  discoveredIslandIds: ['a', 'b', 'c', 'd', 'roost'],
  discoveredRouteIds: ['ab', 'bc', 'cd', 'cr', 'ah'],
  currentIslandId: 'a',
};

{
  const context = deriveExpeditionContext(journeyBase);
  assert.equal(context.routeId, 'ab');
  assert.equal(context.destinationIslandId, 'b');
  assert.equal(context.purpose, 'landmark');
  assert.equal(expeditionJournalLine(context), 'A remembered way seems to lead toward something unfinished.');
  assert.equal(JSON.stringify(context).includes('hidden'), false);
}

{
  const exploration = { events: [{ kind: 'route-completed', routeId: 'ab', occurredAt: 1 }] };
  const arrived = deriveExpeditionContext({ ...journeyBase, exploration });
  assert.equal(arrived.routeId, 'ab');
  assert.equal(arrived.phase, 'arrived');
  assert.equal(arrived.purpose, 'landmark');

  const next = deriveExpeditionContext({ ...journeyBase, exploration, currentIslandId: 'b' });
  assert.equal(next.routeId, 'bc');
  assert.equal(next.destinationIslandId, 'c');
  assert.equal(next.purpose, 'landmark');
}

{
  const unrelatedCompletion = deriveExpeditionContext({
    ...journeyBase,
    exploration: { events: [{ kind: 'route-completed', routeId: 'cr', occurredAt: 1 }] },
  });
  assert.equal(unrelatedCompletion.routeId, 'ab');
  assert.equal(unrelatedCompletion.phase, 'considering');
}

{
  const context = deriveExpeditionContext({ ...journeyBase, selectedRouteId: 'ab', committedRouteId: 'ab' });
  assert.equal(context.routeId, 'ab');
  assert.equal(context.phase, 'crossing');
}

{
  const allCompleted = ['ab', 'bc', 'cd', 'cr'].map((routeId, index) => ({
    kind: 'route-completed', routeId, occurredAt: index + 1,
  }));
  const exploration = { events: [
    ...allCompleted,
    { kind: 'landmark-investigated', islandId: 'd', occurredAt: 10 },
    { kind: 'roost-established', islandId: 'roost', occurredAt: 11 },
  ] };
  const context = deriveExpeditionContext({ ...journeyBase, exploration });
  assert.equal(context.routeId, 'ab');
  assert.equal(context.purpose, 'roost');
}

{
  const first = deriveExpeditionContext({
    ...journeyBase,
    discoveredIslandIds: ['roost', 'd', 'c', 'b', 'a'],
    discoveredRouteIds: ['cr', 'cd', 'bc', 'ab', 'ah'],
  });
  const second = deriveExpeditionContext({
    ...journeyBase,
    discoveredIslandIds: ['a', 'b', 'c', 'd', 'roost'],
    discoveredRouteIds: ['ab', 'bc', 'cd', 'cr', 'ah'],
  });
  assert.deepEqual(first, second);
}

{
  const restoredEvents = [
    { kind: 'route-completed', routeId: 'ab', occurredAt: 1 },
    { kind: 'route-completed', routeId: 'bc', occurredAt: 2 },
  ];
  const before = deriveExpeditionContext({ ...journeyBase, exploration: { events: restoredEvents }, currentIslandId: 'c' });
  const after = deriveExpeditionContext({ ...journeyBase, exploration: JSON.parse(JSON.stringify({ events: restoredEvents })), currentIslandId: 'c' });
  assert.deepEqual(before, after);
  assert.equal(before.routeId, 'cd');
  assert.equal(before.purpose, 'landmark');
}

{
  assert.deepEqual(deriveExpeditionContext({ ...journeyBase, recoveryActive: true }), { active: false, phase: 'idle', familiar: false });
  assert.deepEqual(deriveExpeditionContext({ ...journeyBase, cancelled: true }), { active: false, phase: 'idle', familiar: false });
  assert.deepEqual(deriveExpeditionContext({ world: { islands: [{}], routes: [{}] } }), { active: false, phase: 'idle', familiar: false });
}

{
  const islands = ['d', 'a', 'c', 'b', 'roost'];
  const routes = ['cr', 'cd', 'bc', 'ab', 'ah'];
  const events = [{ kind: 'route-completed', routeId: 'ab', occurredAt: 1 }];
  deriveExpeditionContext({ ...journeyBase, discoveredIslandIds: islands, discoveredRouteIds: routes, exploration: { events } });
  assert.deepEqual(islands, ['d', 'a', 'c', 'b', 'roost']);
  assert.deepEqual(routes, ['cr', 'cd', 'bc', 'ab', 'ah']);
  assert.deepEqual(events, [{ kind: 'route-completed', routeId: 'ab', occurredAt: 1 }]);
}

{
  const context = deriveExpeditionContext(journeyBase);
  assert.deepEqual(Object.keys(context).sort(), [
    'active', 'departureIslandId', 'destinationIslandId', 'familiar', 'phase', 'purpose', 'routeId',
  ]);
  assert.equal(Object.values(context).some((value) => Array.isArray(value)), false);
}