import assert from 'node:assert/strict';
import {
  deriveFamiliarCrossingSignature,
  familiarCrossingMistMultiplier,
  familiarCrossingPublicState,
} from '../src/core/familiar-crossing-signature.js';

const exploration = { events: [{ kind: 'route-completed', routeId: 'route-a' }] };
const discoveredRouteIds = ['route-a', 'route-b'];

const active = deriveFamiliarCrossingSignature({
  currentRouteId: 'route-a',
  currentRegionId: 'region-1',
  discoveredRouteIds,
  exploration,
  crossingActive: true,
});
assert.equal(active.active, true);
assert.equal(active.familiar, true);
assert.ok(['hush', 'pressure', 'resonance', 'clearing'].includes(active.signature));
assert.ok(familiarCrossingMistMultiplier(active.signature) >= 0.92);
assert.ok(familiarCrossingMistMultiplier(active.signature) <= 1.02);

const stable = deriveFamiliarCrossingSignature({
  currentRouteId: 'route-a',
  currentRegionId: 'region-1',
  discoveredRouteIds: [...discoveredRouteIds].reverse(),
  exploration: { events: [...exploration.events] },
  crossingActive: true,
});
assert.equal(stable.signature, active.signature);

assert.equal(deriveFamiliarCrossingSignature({
  currentRouteId: 'route-b', discoveredRouteIds, exploration, crossingActive: true,
}).active, false, 'unfamiliar discovered route must not activate');

assert.equal(deriveFamiliarCrossingSignature({
  currentRouteId: 'hidden-route', discoveredRouteIds, exploration: { events: [{ kind: 'route-completed', routeId: 'hidden-route' }] }, crossingActive: true,
}).active, false, 'hidden route must fail closed');

assert.equal(deriveFamiliarCrossingSignature({
  currentRouteId: 'route-a', discoveredRouteIds, exploration, crossingActive: false,
}).active, false, 'selection without active crossing must not activate');

assert.equal(deriveFamiliarCrossingSignature({
  currentRouteId: 'route-a', discoveredRouteIds, exploration, crossingActive: true, recoveryActive: true,
}).active, false, 'recovery must suppress signature');

const reduced = deriveFamiliarCrossingSignature({
  currentRouteId: 'route-a', currentRegionId: 'region-1', discoveredRouteIds, exploration, crossingActive: true, reducedMotion: true,
});
assert.equal(reduced.signature, active.signature);
assert.equal(reduced.reducedMotion, true);

const secretInput = {
  currentRouteId: 'route-a',
  currentRegionId: 'region-1',
  discoveredRouteIds,
  exploration: { events: [{ kind: 'route-completed', routeId: 'route-a', coordinates: { x: 999 }, hiddenEndpoint: 'secret-isle' }] },
  crossingActive: true,
};
const before = JSON.stringify(secretInput);
const publicState = familiarCrossingPublicState(deriveFamiliarCrossingSignature(secretInput));
assert.deepEqual(Object.keys(publicState).sort(), ['active', 'familiar', 'signature']);
assert.equal(JSON.stringify(secretInput), before, 'caller input must remain immutable');
assert.equal(JSON.stringify(publicState).includes('secret'), false);
assert.equal(JSON.stringify(publicState).includes('999'), false);

const malformed = familiarCrossingPublicState(deriveFamiliarCrossingSignature({
  currentRouteId: { secret: true },
  discoveredRouteIds: ['route-a'],
  exploration: { events: [{ kind: 'route-completed', routeId: 44 }] },
  crossingActive: true,
}));
assert.deepEqual(malformed, { active: false, familiar: false, signature: null });

console.log('familiar-crossing-signature regressions passed');
