import assert from 'node:assert/strict';
import { createGuidanceSettingsSurface, routeGuidanceSettingsSurfaceAction } from '../src/interface/guidance-settings-surface.js';

const standard = createGuidanceSettingsSurface({ isOpen: true, viewportWidth: 1200, settings: { mode: 'standard', soundEnabled: true } });
assert.equal(standard.isOpen, true);
assert.equal(standard.layout, 'inline');
assert.equal(standard.controls.length, 5);
assert.equal(standard.controls[2].value, true);

const minimal = createGuidanceSettingsSurface({ compact: true, settings: { mode: 'minimal', reducedMotion: true } });
assert.equal(minimal.layout, 'stacked');
assert.equal(minimal.summary, 'Guidance announces arrivals only.');
assert.equal(minimal.controls[3].value, true);

const recovered = createGuidanceSettingsSurface({ viewportWidth: Number.NaN, settings: { mode: 'unknown' } });
assert.equal(recovered.controls[2].value, true);
assert.equal(recovered.telemetry.malformedViewportRecovered, true);

assert.deepEqual(routeGuidanceSettingsSurfaceAction({ type: 'set-mode', mode: 'minimal' }), { type: 'set-mode', mode: 'minimal' });
assert.deepEqual(routeGuidanceSettingsSurfaceAction({ type: 'set-mode', mode: 'unknown' }), { type: 'noop' });
assert.deepEqual(routeGuidanceSettingsSurfaceAction({ type: 'toggle-sound' }), { type: 'toggle-sound' });
assert.equal(Object.isFrozen(standard), true);
assert.equal(Object.isFrozen(standard.controls), true);
assert.doesNotThrow(() => JSON.stringify(standard));
