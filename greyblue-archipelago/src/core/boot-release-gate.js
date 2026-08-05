import { buildReleaseReadiness } from './release-readiness.js';

function asErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'unknown-load-failure';
}

function freezeRecord(value) {
  return Object.freeze({ ...value });
}

async function attemptLoad(kind, loader, source) {
  if (typeof loader !== 'function' || typeof source !== 'string' || !source.trim()) {
    return freezeRecord({ kind, ok: false, value: null, error: `${kind}:loader-unavailable` });
  }

  try {
    const value = await loader(source);
    if (!value) {
      return freezeRecord({ kind, ok: false, value: null, error: `${kind}:empty-load-result` });
    }
    return freezeRecord({ kind, ok: true, value, error: null });
  } catch (error) {
    return freezeRecord({ kind, ok: false, value: null, error: `${kind}:${asErrorMessage(error)}` });
  }
}

export async function executeBootReleaseGate(input = {}) {
  const readiness = input.readiness || buildReleaseReadiness(input.releaseInput || {});
  const assets = input.assets && typeof input.assets === 'object' ? input.assets : {};
  const fallbackFactories = input.fallbackFactories && typeof input.fallbackFactories === 'object'
    ? input.fallbackFactories
    : {};

  const releaseGateOpen = readiness.publicBuildReady === true;
  const dragonSource = releaseGateOpen ? assets.dragon : null;
  const isleSource = releaseGateOpen ? assets.isle : null;

  const [dragonLoad, isleLoad] = releaseGateOpen
    ? await Promise.all([
        attemptLoad('dragon', input.loadDragon, dragonSource),
        attemptLoad('isle', input.loadIsle, isleSource),
      ])
    : [
        freezeRecord({ kind: 'dragon', ok: false, value: null, error: 'dragon:release-gate-closed' }),
        freezeRecord({ kind: 'isle', ok: false, value: null, error: 'isle:release-gate-closed' }),
      ];

  const loadFailures = [dragonLoad, isleLoad]
    .filter((result) => !result.ok)
    .map((result) => result.error)
    .sort();

  let dragon = dragonLoad.value;
  let isle = isleLoad.value;
  const fallbackUsed = [];

  if (!dragon && typeof fallbackFactories.dragon === 'function') {
    dragon = fallbackFactories.dragon();
    if (dragon) fallbackUsed.push('dragon');
  }
  if (!isle && typeof fallbackFactories.isle === 'function') {
    isle = fallbackFactories.isle();
    if (isle) fallbackUsed.push('isle');
  }

  const playable = Boolean(dragon && isle);
  const degraded = !releaseGateOpen || loadFailures.length > 0 || fallbackUsed.length > 0;
  const mode = playable
    ? degraded ? 'minimal-playable' : 'released'
    : 'blocked';

  const telemetry = Object.freeze({
    mode,
    playable,
    degraded,
    releaseGateOpen,
    selected: readiness.selected,
    requiredFailureCount: readiness.requiredFailureCount,
    optionalOmissionCount: readiness.optionalOmissionCount,
    loadFailureCount: loadFailures.length,
    loadFailures: Object.freeze(loadFailures),
    fallbackUsed: Object.freeze(fallbackUsed.sort()),
  });

  return Object.freeze({
    mode,
    playable,
    dragon,
    isle,
    readiness,
    telemetry,
  });
}
