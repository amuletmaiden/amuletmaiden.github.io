import { buildReleaseReadiness } from './release-readiness.js';
import { executeBootReleaseGate } from './boot-release-gate.js';

export const RELEASED_HANDOFFS = Object.freeze({
  dragon: Object.freeze({
    releaseId: 'greyblue-dragon-flight-m1',
    status: 'released',
    gameSafe: true,
    coordinateContract: 'three-y-up-metres',
    scaleContract: 'app-normalized',
    saveSchema: 2,
    files: Object.freeze(['dragon.glb']),
    optional: Object.freeze({ animation: true, sound: false }),
    source: '../greyblue-dragon-flight-m1/dragon.glb',
  }),
  isle: Object.freeze({
    releaseId: 'greyblue-dragon-flight-m1',
    status: 'released',
    gameSafe: true,
    coordinateContract: 'three-y-up-metres',
    scaleContract: 'app-normalized',
    saveSchema: 2,
    files: Object.freeze(['isle.glb']),
    optional: Object.freeze({ landmarks: false, mysteries: false }),
    source: '../greyblue-dragon-flight-m1/isle.glb',
  }),
});

function cloneManifest(handoff) {
  return {
    releaseId: handoff.releaseId,
    status: handoff.status,
    gameSafe: handoff.gameSafe,
    coordinateContract: handoff.coordinateContract,
    scaleContract: handoff.scaleContract,
    saveSchema: handoff.saveSchema,
    files: [...handoff.files],
    optional: { ...handoff.optional },
  };
}

function finiteFailures(values) {
  return Object.freeze((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .slice(0, 8));
}

export async function createLiveBootPlan(input = {}) {
  const handoffs = input.handoffs && typeof input.handoffs === 'object'
    ? input.handoffs
    : RELEASED_HANDOFFS;
  const dragonHandoff = handoffs.dragon || RELEASED_HANDOFFS.dragon;
  const isleHandoff = handoffs.isle || RELEASED_HANDOFFS.isle;

  const readiness = buildReleaseReadiness({
    saveSchema: Number.isInteger(input.saveSchema) ? input.saveSchema : 2,
    dragonManifest: cloneManifest(dragonHandoff),
    isleManifest: cloneManifest(isleHandoff),
  });

  const result = await executeBootReleaseGate({
    readiness,
    assets: {
      dragon: dragonHandoff.source,
      isle: isleHandoff.source,
    },
    loadDragon: input.loadDragon,
    loadIsle: input.loadIsle,
    fallbackFactories: input.fallbackFactories,
  });

  const smoke = Object.freeze({
    mode: result.mode,
    ready: result.playable,
    playable: result.playable,
    selectedReleaseIds: Object.freeze({
      dragon: readiness.selected.dragonReleaseId,
      isle: readiness.selected.isleReleaseId,
    }),
    dragonSource: result.telemetry.fallbackUsed.includes('dragon') ? 'fallback' : 'released',
    isleSource: result.telemetry.fallbackUsed.includes('isle') ? 'fallback' : 'released',
    failureCodes: finiteFailures([
      ...readiness.requiredFailures,
      ...result.telemetry.loadFailures,
    ]),
    optionalOmissionCount: readiness.optionalOmissionCount,
  });

  return Object.freeze({
    ...result,
    smoke,
  });
}
