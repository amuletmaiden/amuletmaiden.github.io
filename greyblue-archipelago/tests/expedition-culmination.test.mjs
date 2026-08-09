import assert from 'node:assert/strict';
import {
  deriveExpeditionCulmination,
  expeditionCulminationLine,
  idleExpeditionCulmination,
  publicExpeditionCulmination,
} from '../src/core/expedition-culmination.js';

const landmarkContext = Object.freeze({
  active: true,
  phase: 'arrived',
  familiar: false,
  routeId: 'route-a-b',
  departureIslandId: 'isle-a',
  destinationIslandId: 'isle-b',
  purpose: 'landmark',
});
const frontierCrossing = Object.freeze({
  ...landmarkContext,
  phase: 'crossing',
  purpose: 'frontier',
});
const roostContext = Object.freeze({ ...landmarkContext, purpose: 'roost' });
const expectedLandmark = Object.freeze({ islandId: 'isle-b', landmarkId: 'landmark-b' });

function exploration(...events) {
  return { version: 1, events };
}

{
  const result = deriveExpeditionCulmination({
    before: landmarkContext,
    eventKind: 'landmark-investigated',
    eventDetail: { landmarkId: 'landmark-b', hiddenName: 'never publish this' },
    exploration: exploration({ kind: 'landmark-investigated', id: 'landmark-b', landmarkId: 'landmark-b' }),
    expectedDestination: expectedLandmark,
    currentRegionId: 'region-blue',
  });
  assert.equal(result.active, true);
  assert.equal(result.purpose, 'landmark');
  assert.ok(['resonance', 'hush'].includes(result.class));
  assert.match(result.claimKey, /^landmark-investigated:/);
  assert.ok(expeditionCulminationLine(result));
}

{
  const result = deriveExpeditionCulmination({
    before: landmarkContext,
    eventKind: 'landmark-flight-encounter',
    eventDetail: { landmarkId: 'landmark-b', islandId: 'isle-b' },
    exploration: exploration({ kind: 'landmark-flight-encounter', id: 'landmark-b', landmarkId: 'landmark-b', islandId: 'isle-b' }),
    expectedDestination: expectedLandmark,
    currentRegionId: 'region-green',
  });
  assert.equal(result.active, true);
  assert.equal(result.purpose, 'landmark');
}

{
  const result = deriveExpeditionCulmination({
    before: roostContext,
    eventKind: 'roost-established',
    eventDetail: { islandId: 'isle-b', landingZoneId: 'shelf-b' },
    exploration: exploration({ kind: 'roost-established', id: 'shelf-b', islandId: 'isle-b', landingZoneId: 'shelf-b' }),
    expectedDestination: { islandId: 'isle-b' },
    currentRegionId: 'region-rest',
  });
  assert.equal(result.active, true);
  assert.equal(result.purpose, 'roost');
  assert.ok(['warmth', 'hush'].includes(result.class));
}

{
  const result = deriveExpeditionCulmination({
    before: frontierCrossing,
    after: { ...frontierCrossing, phase: 'arrived', purpose: 'familiar', familiar: true },
    eventKind: 'route-completed',
    eventDetail: { routeId: 'route-a-b' },
    exploration: exploration({ kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b' }),
    expectedDestination: { islandId: 'isle-b' },
    currentRegionId: 'region-open',
  });
  assert.equal(result.active, true);
  assert.equal(result.purpose, 'frontier');
  assert.ok(['clearing', 'resonance'].includes(result.class));
}

{
  const stillGoing = deriveExpeditionCulmination({
    before: frontierCrossing,
    after: { ...frontierCrossing, phase: 'arrived' },
    eventKind: 'route-completed',
    eventDetail: { routeId: 'route-a-b' },
    exploration: exploration({ kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b' }),
    expectedDestination: { islandId: 'isle-b' },
  });
  assert.deepEqual(stillGoing, idleExpeditionCulmination());
}

{
  const falseLandmarks = [
    { eventKind: 'landmark-investigated', eventDetail: { landmarkId: 'wrong' }, exploration: exploration({ kind: 'landmark-investigated', id: 'wrong', landmarkId: 'wrong' }) },
    { eventKind: 'landmark-investigated', eventDetail: { landmarkId: 'landmark-b' }, exploration: exploration() },
    { eventKind: 'landmark-flight-encounter', eventDetail: { landmarkId: 'landmark-b', islandId: 'wrong' }, exploration: exploration({ kind: 'landmark-flight-encounter', id: 'landmark-b', landmarkId: 'landmark-b', islandId: 'wrong' }) },
  ];
  for (const input of falseLandmarks) {
    assert.deepEqual(deriveExpeditionCulmination({
      before: landmarkContext,
      expectedDestination: expectedLandmark,
      ...input,
    }), idleExpeditionCulmination());
  }
}

{
  const falseRoosts = [
    { eventDetail: { islandId: 'wrong' }, exploration: exploration({ kind: 'roost-established', id: 'shelf', islandId: 'wrong' }) },
    { eventDetail: { islandId: 'isle-b' }, exploration: exploration() },
  ];
  for (const input of falseRoosts) {
    assert.deepEqual(deriveExpeditionCulmination({
      before: roostContext,
      eventKind: 'roost-established',
      expectedDestination: { islandId: 'isle-b' },
      ...input,
    }), idleExpeditionCulmination());
  }
}

{
  const falseFrontiers = [
    { before: { ...frontierCrossing, phase: 'considering' }, after: { ...frontierCrossing, purpose: 'familiar' }, eventDetail: { routeId: 'route-a-b' } },
    { before: frontierCrossing, after: { ...frontierCrossing, purpose: 'familiar' }, eventDetail: { routeId: 'wrong' } },
    { before: frontierCrossing, after: { ...frontierCrossing, purpose: 'familiar' }, eventDetail: { routeId: 'route-a-b' }, exploration: exploration() },
  ];
  for (const input of falseFrontiers) {
    assert.deepEqual(deriveExpeditionCulmination({
      eventKind: 'route-completed',
      exploration: exploration({ kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b' }),
      expectedDestination: { islandId: 'isle-b' },
      ...input,
    }), idleExpeditionCulmination());
  }
}

{
  const familiar = deriveExpeditionCulmination({
    before: { ...landmarkContext, purpose: 'familiar' },
    eventKind: 'route-completed',
    eventDetail: { routeId: 'route-a-b' },
    exploration: exploration({ kind: 'route-completed', id: 'route-a-b', routeId: 'route-a-b' }),
    expectedDestination: { islandId: 'isle-b' },
  });
  assert.deepEqual(familiar, idleExpeditionCulmination());
}

{
  const result = deriveExpeditionCulmination({
    before: landmarkContext,
    eventKind: 'landmark-investigated',
    eventDetail: { landmarkId: 'landmark-b', hiddenDestination: 'secret-isle', x: 999 },
    exploration: exploration({ kind: 'landmark-investigated', id: 'landmark-b', landmarkId: 'landmark-b', secret: 'do-not-publish' }),
    expectedDestination: { ...expectedLandmark, hiddenRoutePlan: ['secret-route'] },
    currentRegionId: 'region-blue',
  });
  const published = publicExpeditionCulmination(result);
  assert.deepEqual(Object.keys(published).sort(), ['active', 'class', 'durationMs', 'phase', 'purpose']);
  assert.equal(JSON.stringify(published).includes('secret'), false);
  assert.equal(JSON.stringify(published).includes('claimKey'), false);
}

{
  const normal = deriveExpeditionCulmination({
    before: roostContext,
    eventKind: 'roost-established',
    eventDetail: { islandId: 'isle-b' },
    exploration: exploration({ kind: 'roost-established', id: 'shelf-b', islandId: 'isle-b' }),
    expectedDestination: { islandId: 'isle-b' },
  });
  const reduced = deriveExpeditionCulmination({
    before: roostContext,
    eventKind: 'roost-established',
    eventDetail: { islandId: 'isle-b' },
    exploration: exploration({ kind: 'roost-established', id: 'shelf-b', islandId: 'isle-b' }),
    expectedDestination: { islandId: 'isle-b' },
    reducedMotion: true,
  });
  assert.equal(normal.class, reduced.class);
  assert.equal(normal.durationMs, 4600);
  assert.equal(reduced.durationMs, 2400);
}

{
  const before = { ...landmarkContext };
  const eventDetail = { landmarkId: 'landmark-b' };
  const saved = exploration({ kind: 'landmark-investigated', id: 'landmark-b', landmarkId: 'landmark-b' });
  const destination = { ...expectedLandmark };
  deriveExpeditionCulmination({ before, eventKind: 'landmark-investigated', eventDetail, exploration: saved, expectedDestination: destination });
  assert.deepEqual(before, { ...landmarkContext });
  assert.deepEqual(eventDetail, { landmarkId: 'landmark-b' });
  assert.deepEqual(saved, exploration({ kind: 'landmark-investigated', id: 'landmark-b', landmarkId: 'landmark-b' }));
  assert.deepEqual(destination, { ...expectedLandmark });
}

{
  assert.deepEqual(deriveExpeditionCulmination(), idleExpeditionCulmination());
  assert.deepEqual(publicExpeditionCulmination({ active: true, purpose: 'wrong', class: 'secret' }), idleExpeditionCulmination());
  assert.equal(expeditionCulminationLine(null), null);
}