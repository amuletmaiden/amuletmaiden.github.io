import assert from 'node:assert/strict';
import test from 'node:test';
import { startLiveBootRuntime } from '../src/core/live-boot-runtime.js';

const dragon = Object.freeze({ scene: Object.freeze({ name: 'dragon' }), animations: Object.freeze([]) });
const isle = Object.freeze({ scene: Object.freeze({ name: 'isle' }) });
const fallbackDragon = Object.freeze({ scene: Object.freeze({ name: 'fallback-dragon' }), animations: Object.freeze([]) });
const fallbackIsle = Object.freeze({ scene: Object.freeze({ name: 'fallback-isle' }) });

function runtime(overrides = {}) {
  const attached = [];
  return {
    attached,
    createDragonFallback: () => fallbackDragon,
    createIsleFallback: () => fallbackIsle,
    attachDragon: (value) => attached.push(['dragon', value]),
    attachIsle: (value) => attached.push(['isle', value]),
    detachAll: () => attached.splice(0),
    ...overrides,
  };
}

test('attaches both released assets and publishes bounded boot state', async () => {
  const target = {};
  const appRuntime = runtime();
  const result = await startLiveBootRuntime({
    runtime: appRuntime,
    stateTarget: target,
    loadDragon: async () => dragon,
    loadIsle: async () => isle,
  });

  assert.equal(result.mode, 'released');
  assert.equal(result.playable, true);
  assert.equal(appRuntime.attached.length, 2);
  assert.equal(target.boot.dragonSource, 'released');
  assert.equal(target.boot.isleSource, 'released');
  assert.doesNotThrow(() => JSON.stringify(target.boot));
});

test('uses a visible dragon fallback without blocking the isle', async () => {
  const appRuntime = runtime();
  const result = await startLiveBootRuntime({
    runtime: appRuntime,
    loadDragon: async () => { throw new Error('missing'); },
    loadIsle: async () => isle,
  });

  assert.equal(result.mode, 'minimal-playable');
  assert.equal(result.boot.dragonSource, 'fallback');
  assert.equal(result.boot.isleSource, 'released');
  assert.equal(appRuntime.attached.find(([kind]) => kind === 'dragon')[1], fallbackDragon);
});

test('uses an isle fallback while retaining a released dragon', async () => {
  const result = await startLiveBootRuntime({
    runtime: runtime(),
    loadDragon: async () => dragon,
    loadIsle: async () => null,
  });

  assert.equal(result.mode, 'minimal-playable');
  assert.equal(result.boot.dragonSource, 'released');
  assert.equal(result.boot.isleSource, 'fallback');
});

test('blocks before loading when required runtime hooks are absent', async () => {
  let loads = 0;
  const result = await startLiveBootRuntime({
    runtime: {},
    loadDragon: async () => { loads += 1; return dragon; },
    loadIsle: async () => { loads += 1; return isle; },
  });

  assert.equal(result.mode, 'blocked');
  assert.equal(result.playable, false);
  assert.equal(loads, 0);
  assert.ok(result.boot.failureCodes.includes('runtime:createDragonFallback-missing'));
});

test('rolls back partial scene attachment when an attach hook fails', async () => {
  const appRuntime = runtime({
    attachDragon: () => { throw new Error('scene rejected dragon'); },
  });
  const result = await startLiveBootRuntime({
    runtime: appRuntime,
    loadDragon: async () => dragon,
    loadIsle: async () => isle,
  });

  assert.equal(result.mode, 'blocked');
  assert.equal(result.playable, false);
  assert.equal(appRuntime.attached.length, 0);
  assert.ok(result.boot.failureCodes.includes('runtime:dragon-attach-failed'));
});

test('does not mutate caller-owned runtime or state container shape', async () => {
  const appRuntime = runtime();
  const beforeKeys = Object.keys(appRuntime).sort();
  const target = { existing: Object.freeze({ keep: true }) };
  const result = await startLiveBootRuntime({
    runtime: appRuntime,
    stateTarget: target,
    loadDragon: async () => dragon,
    loadIsle: async () => isle,
  });

  assert.deepEqual(Object.keys(appRuntime).sort(), beforeKeys);
  assert.equal(target.existing.keep, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.boot), true);
});
