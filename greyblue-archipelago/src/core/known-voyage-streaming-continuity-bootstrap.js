import * as THREE from 'three';
import { buildArchipelago } from '../world/archipelago.js';
import {
  createKnownVoyageStreamingContinuity,
  publicKnownVoyageStreamingContinuity,
} from './known-voyage-streaming-continuity.js';
import {
  clearKnownVoyageStreamingCandidates,
  setKnownVoyageStreamingCandidates,
} from './known-voyage-streaming-channel.js';

let worldSeed = null;
let world = null;

function worldFor(seed) {
  const nextSeed = Number.isInteger(seed) ? seed : 1337;
  if (!world || worldSeed !== nextSeed) {
    worldSeed = nextSeed;
    world = buildArchipelago({ seed: nextSeed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function recoveryActive(state) {
  return state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery';
}

function restorePublishing(state) {
  return Boolean(state?.restorePublishing || state?.explorationRestorePublishing);
}

function updateContinuity() {
  const state = globalThis.__greyblueState;
  const voyage = globalThis.__greyblueKnownVoyageIntention;
  if (state?.ready !== true || voyage?.active !== true) {
    clearKnownVoyageStreamingCandidates();
    globalThis.__greyblueKnownVoyageStreaming = Object.freeze({ active: false, retaining: false, prewarming: false });
    return;
  }

  const authoredWorld = worldFor(state.seed);
  const continuity = createKnownVoyageStreamingContinuity({
    world: authoredWorld,
    position: state.position,
    activeIslandIds: state.activeIslandIds,
    discoveredIslandIds: state.discovered,
    currentRegionId: state.currentRegion?.id,
    voyageActive: voyage.active === true,
    paused: state.paused === true,
    recovery: recoveryActive(state),
    restorePublishing: restorePublishing(state),
    activateRange: state.world?.streaming?.activateRange ?? 2400,
    retainRange: Math.max(state.world?.streaming?.deactivateRange ?? 3000, 3400),
    prewarmRange: 3000,
  });

  const wanted = new Set([...continuity.retainIslandIds, ...continuity.prewarmIslandIds]);
  setKnownVoyageStreamingCandidates(authoredWorld.islands.filter((island) => wanted.has(island.id)));
  globalThis.__greyblueKnownVoyageStreaming = publicKnownVoyageStreamingContinuity(continuity);
}

globalThis.__greyblueKnownVoyageStreaming = Object.freeze({ active: false, retaining: false, prewarming: false });

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function renderWithKnownVoyageStreamingContinuity(scene, camera) {
  updateContinuity();
  return originalRender.call(this, scene, camera);
};
