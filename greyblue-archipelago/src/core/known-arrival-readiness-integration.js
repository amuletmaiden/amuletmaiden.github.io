import {
  deriveKnownArrivalReadiness,
  publicKnownArrivalReadiness,
} from './known-arrival-readiness.js';

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function recoveryActive(state) {
  return state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery';
}

function restorePublishing(state) {
  return Boolean(state?.restorePublishing || state?.explorationRestorePublishing);
}

function crossingActive(state) {
  return state?.routeChoice?.reason === 'active-crossing'
    || globalThis.__greyblueHighAirCrossing?.active === true;
}

export function deriveKnownArrivalReadinessFrame({
  state,
  voyage,
  target,
  world,
  isResident = () => false,
} = {}) {
  const targetId = cleanId(target?.id);
  const targetRegionId = cleanId(target?.regionId);
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const island = islands.find((candidate) => cleanId(candidate?.id) === targetId) ?? null;
  const discovered = new Set((Array.isArray(state?.discovered) ? state.discovered : []).map(cleanId).filter(Boolean));
  const activeIds = new Set((Array.isArray(state?.activeIslandIds) ? state.activeIslandIds : []).map(cleanId).filter(Boolean));
  const nearestId = cleanId(state?.nearestIsland?.id);
  const currentRegionId = cleanId(state?.currentRegion?.id);
  const distance = Number(state?.nearestIsland?.distance);
  const scale = Number(island?.scale);
  const radius = Number.isFinite(scale) && scale > 0 ? 110 * scale : Number.NaN;
  const approach = Boolean(targetId)
    && Boolean(targetRegionId)
    && nearestId === targetId
    && currentRegionId === targetRegionId
    && Number.isFinite(distance)
    && Number.isFinite(radius)
    && distance <= radius;

  return publicKnownArrivalReadiness(deriveKnownArrivalReadiness({
    runtime: {
      ready: state?.ready === true,
      paused: state?.paused === true,
      recovery: recoveryActive(state),
      restoring: restorePublishing(state),
      restorePublication: restorePublishing(state),
      crossing: crossingActive(state),
    },
    voyageActive: voyage?.active === true,
    known: Boolean(targetId) && discovered.has(targetId) && Boolean(island),
    approach,
    requested: Boolean(targetId) && activeIds.has(targetId),
    resident: Boolean(targetId) && isResident(targetId) === true,
    surfaceSample: state?.surface ?? null,
  }));
}

export const knownArrivalReadinessIntegrationInternals = Object.freeze({
  cleanId,
  recoveryActive,
  restorePublishing,
});
