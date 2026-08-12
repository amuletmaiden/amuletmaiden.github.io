import { deriveLandingApproachReadback } from '../world/landing-approach-readback.js';

const INACTIVE = Object.freeze({ active: false, alignment: null, descent: null });

function interrupted(state, crossingActive) {
  return crossingActive
    || state?.paused === true
    || state?.collision?.requiresRecovery === true
    || state?.flight?.mode === 'recovery'
    || state?.restorePublishing === true
    || state?.explorationRestorePublishing === true;
}

function knownCurrentCorridors(state) {
  const island = state?.nearestIsland;
  if (!island?.id || !Array.isArray(island.approachCorridors)) return [];
  if (!Array.isArray(state?.discovered) || !state.discovered.includes(island.id)) return [];
  if (!state?.currentRegion?.id || island.regionId !== state.currentRegion.id) return [];
  return island.approachCorridors;
}

export function deriveLiveLandingApproachReadback(state, { crossingActive = false } = {}) {
  if (!state || interrupted(state, crossingActive)) return INACTIVE;
  const airborne = state?.flight?.airborne === true && state?.collision?.grounded !== true;
  for (const corridor of knownCurrentCorridors(state)) {
    const view = deriveLandingApproachReadback({
      eligible: true,
      airborne,
      position: state.position,
      yaw: state?.flight?.yaw,
      verticalVelocity: state?.flight?.velocity?.y,
      corridor,
    });
    if (view.active) return view;
  }
  return INACTIVE;
}
