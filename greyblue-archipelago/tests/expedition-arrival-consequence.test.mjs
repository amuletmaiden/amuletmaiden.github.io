import assert from 'node:assert/strict';
import {
  deriveExpeditionArrivalConsequence,
  expeditionArrivalCooldown,
  expeditionArrivalLine,
  idleExpeditionArrivalConsequence,
} from '../src/core/expedition-arrival-consequence.js';

const crossing = Object.freeze({
  active: true,
  phase: 'crossing',
  familiar: false,
  routeId: 'route-a-b',
  departureIslandId: 'isle-a',
  destinationIslandId: 'isle-b',
  purpose: 'landmark',
});
const arrived = Object.freeze({ ...crossing, phase: 'arrived' });

{
  const consequence = deriveExpeditionArrivalConsequence({
    before: crossing,
    after: arrived,
    completion: { routeId: 'route-a-b', occurredAt: 10 },
  });
  assert.deepEqual(consequence, {
    active: true,
    phase: 'responding',
    class: 'resonance',
    routeId: 'route-a-b',
    durationMs: 3200,
    cooldownMs: 1200,
  });
  assert.equal(expeditionArrivalLine(consequence), 'The mist answers with a low resonance.');
}

{
  const classes = [
    ['landmark', 'resonance'],
    ['frontier', 'clearing'],
    ['roost', 'warmth'],
    ['familiar', 'hush'],
  ];
  for (const [purpose, expected] of classes) {
    const before = { ...crossing, purpose };
    const after = { ...arrived, purpose };
    assert.equal(deriveExpeditionArrivalConsequence({ before, after, completion: { routeId: 'route-a-b' } }).class, expected);
  }
}

{
  const reduced = deriveExpeditionArrivalConsequence({
    before: crossing,
    after: arrived,
    completion: { routeId: 'route-a-b' },
    reducedMotion: true,
  });
  assert.equal(reduced.durationMs, 1800);
  assert.equal(reduced.class, 'resonance');
}

{
  const falseArrivals = [
    { before: { ...crossing, phase: 'considering' }, after: arrived, completion: { routeId: 'route-a-b' } },
    { before: crossing, after: arrived, completion: { routeId: 'route-other' } },
    { before: crossing, after: { ...arrived, phase: 'considering' }, completion: { routeId: 'route-a-b' } },
    { before: crossing, after: { ...arrived, routeId: 'route-other' }, completion: { routeId: 'route-a-b' } },
    { before: crossing, after: arrived, completion: {} },
    { before: null, after: arrived, completion: { routeId: 'route-a-b' } },
  ];
  for (const input of falseArrivals) assert.deepEqual(deriveExpeditionArrivalConsequence(input), idleExpeditionArrivalConsequence());
}

{
  const hidden = deriveExpeditionArrivalConsequence({
    before: { ...crossing, secretRoutePlan: ['hidden-route'], hiddenDestination: 'hidden-isle' },
    after: { ...arrived, secretRoutePlan: ['hidden-route'], hiddenDestination: 'hidden-isle' },
    completion: { routeId: 'route-a-b', hiddenDestination: 'hidden-isle' },
  });
  assert.deepEqual(Object.keys(hidden).sort(), ['active', 'class', 'cooldownMs', 'durationMs', 'phase', 'routeId']);
  assert.equal(JSON.stringify(hidden).includes('hidden'), false);
}

{
  const consequence = deriveExpeditionArrivalConsequence({ before: crossing, after: arrived, completion: { routeId: 'route-a-b' } });
  assert.deepEqual(expeditionArrivalCooldown(consequence), {
    active: false,
    phase: 'cooldown',
    class: 'resonance',
    routeId: 'route-a-b',
    cooldownMs: 1200,
  });
  assert.equal(expeditionArrivalLine(expeditionArrivalCooldown(consequence)), null);
}

{
  const before = { ...crossing };
  const after = { ...arrived };
  const completion = { routeId: 'route-a-b' };
  deriveExpeditionArrivalConsequence({ before, after, completion });
  assert.deepEqual(before, { ...crossing });
  assert.deepEqual(after, { ...arrived });
  assert.deepEqual(completion, { routeId: 'route-a-b' });
}
