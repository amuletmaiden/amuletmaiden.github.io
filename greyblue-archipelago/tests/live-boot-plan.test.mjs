import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveBootPlan, RELEASED_HANDOFFS } from '../src/core/live-boot-plan.js';

const releasedDragon = Object.freeze({ scene: Object.freeze({ name: 'dragon' }), animations: Object.freeze([]) });
const releasedIsle = Object.freeze({ scene: Object.freeze({ name: 'isle' }) });
const fallbackDragon = Object.freeze({ scene: Object.freeze({ name: 'fallback-dragon' }), animations: Object.freeze([]) });
const fallbackIsle = Object.freeze({ scene: Object.freeze({ name: 'fallback-isle' }) });

function factories() {
  return {
    dragon: () => fallbackDragon,
    isle: () => fallbackIsle,
  };
}

test('released assets produce a released playable plan', async () => {
  const plan = await createLiveBootPlan({
    loadDragon: async () => releasedDragon,
    loadIsle: async () => releasedIsle,
    fallbackFactories: factories(),
  });

  assert.equal(plan.mode, 'released');
  assert.equal(plan.smoke.playable, true);
  assert.equal(plan.smoke.dragonSource, 'released');
  assert.equal(plan.smoke.isleSource, 'released');
  assert.deepEqual(plan.smoke.failureCodes, []);
});

test('missing dragon degrades without blocking play', async () => {
  const plan = await createLiveBootPlan({
    loadDragon: async () => { throw new Error('missing'); },
    loadIsle: async () => releasedIsle,
    fallbackFactories: factories(),
  });

  assert.equal(plan.mode, 'minimal-playable');
  assert.equal(plan.smoke.dragonSource, 'fallback');
  assert.equal(plan.smoke.isleSource, 'released');
  assert.equal(plan.smoke.failureCodes[0], 'dragon:missing');
});

test('missing isle degrades without blocking play', async () => {
  const plan = await createLiveBootPlan({
    loadDragon: async () => releasedDragon,
    loadIsle: async () => { throw new Error('missing'); },
    fallbackFactories: factories(),
  });

  assert.equal(plan.mode, 'minimal-playable');
  assert.equal(plan.smoke.dragonSource, 'released');
  assert.equal(plan.smoke.isleSource, 'fallback');
});

test('both optional hero assets may fall back', async () => {
  const plan = await createLiveBootPlan({
    loadDragon: async () => null,
    loadIsle: async () => null,
    fallbackFactories: factories(),
  });

  assert.equal(plan.mode, 'minimal-playable');
  assert.equal(plan.smoke.playable, true);
  assert.equal(plan.smoke.dragonSource, 'fallback');
  assert.equal(plan.smoke.isleSource, 'fallback');
});

test('required save incompatibility closes release gate and blocks without fallbacks', async () => {
  const plan = await createLiveBootPlan({
    saveSchema: 3,
    loadDragon: async () => releasedDragon,
    loadIsle: async () => releasedIsle,
    fallbackFactories: {},
  });

  assert.equal(plan.mode, 'blocked');
  assert.equal(plan.smoke.playable, false);
  assert.ok(plan.smoke.failureCodes.some((code) => code.includes('save-schema-2-expected-3')));
});

test('handoffs and caller inputs remain unchanged and output is JSON-safe', async () => {
  const before = JSON.stringify(RELEASED_HANDOFFS);
  const input = Object.freeze({
    loadDragon: async () => releasedDragon,
    loadIsle: async () => releasedIsle,
    fallbackFactories: Object.freeze(factories()),
  });
  const plan = await createLiveBootPlan(input);

  assert.equal(JSON.stringify(RELEASED_HANDOFFS), before);
  assert.doesNotThrow(() => JSON.stringify(plan.smoke));
  assert.equal(Object.isFrozen(plan.smoke), true);
  assert.equal(Object.isFrozen(plan.smoke.selectedReleaseIds), true);
});
