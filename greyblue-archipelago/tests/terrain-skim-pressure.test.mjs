import assert from 'node:assert/strict';
import {
  createTerrainSkimPressureState,
  stepTerrainSkimPressure,
  terrainSkimPressurePresentation,
  terrainSkimPressurePublicState,
} from '../src/core/terrain-skim-pressure.js';

const base = Object.freeze({
  ready: true,
  paused: false,
  airborne: true,
  recoveryActive: false,
  restorePublishing: false,
  speed: 44,
  position: Object.freeze({ x: 0, y: 130, z: 0 }),
  surfaceHeight: 100,
  surface: 'terrain',
});

function frame(clearance, patch = {}) {
  return {
    ...base,
    ...patch,
    position: patch.position ?? { x: 0, y: base.surfaceHeight + clearance, z: 0 },
  };
}

{
  let state = createTerrainSkimPressureState();
  state = stepTerrainSkimPressure({ state, frame: frame(36) });
  assert.equal(state.skimClass, 'near');
  state = stepTerrainSkimPressure({ state, frame: frame(22) });
  assert.equal(state.skimClass, 'close');
  state = stepTerrainSkimPressure({ state, frame: frame(10) });
  assert.equal(state.skimClass, 'razor');
}

{
  let state = stepTerrainSkimPressure({ frame: frame(36) });
  state = stepTerrainSkimPressure({ state, frame: frame(41) });
  assert.equal(state.skimClass, 'near', 'near hysteresis tolerates bounded sampling jitter');
  state = stepTerrainSkimPressure({ state, frame: frame(44) });
  assert.equal(state.skimClass, null);
}

{
  let state = stepTerrainSkimPressure({ frame: frame(22) });
  state = stepTerrainSkimPressure({ state, frame: frame(26) });
  assert.equal(state.skimClass, 'close', 'close hysteresis prevents threshold chatter');
  state = stepTerrainSkimPressure({ state, frame: frame(28) });
  assert.equal(state.skimClass, 'near');
}

for (const patch of [
  { ready: false },
  { paused: true },
  { airborne: false },
  { recoveryActive: true },
  { restorePublishing: true },
  { speed: 12 },
  { surface: 'water' },
  { surface: '' },
  { surfaceHeight: Number.NaN },
  { position: { x: 0, y: Number.NaN, z: 0 } },
]) {
  const state = stepTerrainSkimPressure({ frame: frame(10, patch) });
  assert.equal(state.skimClass, null);
}

{
  const state = stepTerrainSkimPressure({ frame: frame(-2) });
  assert.equal(state.skimClass, null, 'negative/malformed clearance fails closed');
}

{
  const caller = { state: createTerrainSkimPressureState(), frame: frame(10) };
  const before = JSON.stringify(caller);
  stepTerrainSkimPressure(caller);
  assert.equal(JSON.stringify(caller), before, 'caller inputs remain immutable');
}

{
  const state = stepTerrainSkimPressure({ frame: frame(10) });
  assert.deepEqual(terrainSkimPressurePublicState(state), { active: true, skimClass: 'razor' });
  assert.deepEqual(Object.keys(terrainSkimPressurePublicState(state)), ['active', 'skimClass']);
  const ordinary = terrainSkimPressurePresentation(state);
  const reduced = terrainSkimPressurePresentation(state, { reducedMotion: true });
  const contrast = terrainSkimPressurePresentation(state, { highContrast: true });
  assert.equal(ordinary.skimClass, 'razor');
  assert.ok(ordinary.gain <= 0.12 && contrast.gain <= 0.12);
  assert.equal(ordinary.filterHz, reduced.filterHz, 'reduced motion does not alter semantic class');
}

console.log('terrain skim pressure regression source loaded');
