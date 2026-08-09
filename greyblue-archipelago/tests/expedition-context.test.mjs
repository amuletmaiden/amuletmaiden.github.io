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
}

{
  const context = deriveExpeditionContext({
    ...base,
    exploration: { events: [{ kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b', occurredAt: 1 }] },
  });
  assert.equal(context.routeId, 'route-a-c');
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
}

{
  const first = deriveExpeditionContext({ ...base, discoveredRouteIds: ['route-a-c', 'route-a-b'] });
  const second = deriveExpeditionContext({ ...base, discoveredRouteIds: ['route-a-b', 'route-a-c'] });
  assert.deepEqual(first, second);
}

{
  assert.deepEqual(deriveExpeditionContext({ ...base, recoveryActive: true }), { active: false, phase: 'idle', familiar: false });
  assert.deepEqual(deriveExpeditionContext({ ...base, cancelled: true }), { active: false, phase: 'idle', familiar: false });
  assert.deepEqual(deriveExpeditionContext({ world: { islands: [{}], routes: [{}] } }), { active: false, phase: 'idle', familiar: false });
}

{
  const islands = ['isle-c', 'isle-a', 'isle-b'];
  const routes = ['route-a-c', 'route-a-b'];
  deriveExpeditionContext({ ...base, discoveredIslandIds: islands, discoveredRouteIds: routes });
  assert.deepEqual(islands, ['isle-c', 'isle-a', 'isle-b']);
  assert.deepEqual(routes, ['route-a-c', 'route-a-b']);
}

{
  const context = deriveExpeditionContext(base);
  assert.deepEqual(Object.keys(context).sort(), [
    'active', 'departureIslandId', 'destinationIslandId', 'familiar', 'phase', 'routeId',
  ]);
  assert.equal(expeditionJournalLine(context), 'One remembered crossing still seems to lead somewhere unfinished.');
}
