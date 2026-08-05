import { createLiveBootPlan } from './live-boot-plan.js';

function boundedCodes(values) {
  return Object.freeze((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .slice(0, 8));
}

function requireRuntime(runtime) {
  const required = ['createDragonFallback', 'createIsleFallback', 'attachDragon', 'attachIsle'];
  const missing = required.filter((name) => typeof runtime?.[name] !== 'function');
  return Object.freeze(missing.map((name) => `runtime:${name}-missing`));
}

function publish(target, smoke, additions = {}) {
  const next = Object.freeze({
    ...smoke,
    ...additions,
    failureCodes: boundedCodes([
      ...(smoke?.failureCodes || []),
      ...(additions.failureCodes || []),
    ]),
  });
  if (target && typeof target === 'object') target.boot = next;
  return next;
}

export async function startLiveBootRuntime(input = {}) {
  const runtime = input.runtime || {};
  const stateTarget = input.stateTarget && typeof input.stateTarget === 'object'
    ? input.stateTarget
    : null;
  const runtimeFailures = requireRuntime(runtime);

  if (runtimeFailures.length) {
    return Object.freeze({
      mode: 'blocked',
      playable: false,
      ready: false,
      dragon: null,
      isle: null,
      boot: publish(stateTarget, {
        mode: 'blocked',
        ready: false,
        playable: false,
        selectedReleaseIds: Object.freeze({ dragon: null, isle: null }),
        dragonSource: 'unavailable',
        isleSource: 'unavailable',
        optionalOmissionCount: 0,
        failureCodes: runtimeFailures,
      }),
    });
  }

  const plan = await createLiveBootPlan({
    saveSchema: input.saveSchema,
    handoffs: input.handoffs,
    loadDragon: input.loadDragon,
    loadIsle: input.loadIsle,
    fallbackFactories: {
      dragon: runtime.createDragonFallback,
      isle: runtime.createIsleFallback,
    },
  });

  if (!plan.playable) {
    return Object.freeze({
      mode: plan.mode,
      playable: false,
      ready: false,
      dragon: null,
      isle: null,
      boot: publish(stateTarget, plan.smoke),
    });
  }

  const attachFailures = [];
  try {
    runtime.attachIsle(plan.isle);
  } catch {
    attachFailures.push('runtime:isle-attach-failed');
  }
  try {
    runtime.attachDragon(plan.dragon);
  } catch {
    attachFailures.push('runtime:dragon-attach-failed');
  }

  const playable = attachFailures.length === 0;
  const mode = playable ? plan.mode : 'blocked';
  const boot = publish(stateTarget, plan.smoke, {
    mode,
    ready: playable,
    playable,
    failureCodes: attachFailures,
  });

  if (!playable && typeof runtime.detachAll === 'function') {
    try { runtime.detachAll(); } catch { /* best-effort rollback */ }
  }

  return Object.freeze({
    mode,
    playable,
    ready: playable,
    dragon: playable ? plan.dragon : null,
    isle: playable ? plan.isle : null,
    boot,
  });
}
