const INACTIVE = Object.freeze({ active: false, state: null });
const STATES = new Set(['loading', 'degraded']);

function runtimeEligible(runtime) {
  return Boolean(runtime?.ready === true)
    && runtime?.paused !== true
    && runtime?.recovery !== true
    && runtime?.restoring !== true
    && runtime?.restorePublication !== true
    && runtime?.crossing !== true;
}

function usableSurface(sample) {
  if (!sample || typeof sample !== 'object') return false;
  if (sample.valid === false || sample.missing === true || sample.outOfBounds === true) return false;
  const validity = typeof sample.validity === 'string' ? sample.validity.trim().toLowerCase() : '';
  if (['missing', 'non-finite', 'out-of-bounds', 'invalid', 'stale'].includes(validity)) return false;
  const surface = typeof sample.surface === 'string' ? sample.surface.trim().toLowerCase() : '';
  if (surface === 'water') return false;
  const height = Number(sample.height);
  if (!Number.isFinite(height)) return false;
  return sample.valid === true || validity === 'valid' || validity === 'ready' || validity === '';
}

export function deriveKnownArrivalReadiness({
  runtime,
  voyageActive = false,
  known = false,
  approach = false,
  requested = false,
  resident = false,
  surfaceSample = null,
} = {}) {
  if (!runtimeEligible(runtime) || voyageActive !== true || known !== true || approach !== true) return INACTIVE;

  if (requested !== true || resident !== true) {
    return Object.freeze({ active: true, state: 'loading' });
  }

  if (!usableSurface(surfaceSample)) {
    return Object.freeze({ active: true, state: 'degraded' });
  }

  return INACTIVE;
}

export function publicKnownArrivalReadiness(value) {
  const state = typeof value?.state === 'string' ? value.state.trim().toLowerCase() : '';
  if (value?.active !== true || !STATES.has(state)) return INACTIVE;
  return Object.freeze({ active: true, state });
}

export const knownArrivalReadinessInternals = Object.freeze({
  runtimeEligible,
  usableSurface,
});
