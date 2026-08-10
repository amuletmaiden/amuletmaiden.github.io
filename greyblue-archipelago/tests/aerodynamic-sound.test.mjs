import assert from 'node:assert/strict';
import { deriveAerodynamicSound, aerodynamicSoundPublicState } from '../src/core/aerodynamic-sound.js';

const base = Object.freeze({ ready: true, paused: false, airborne: true, recoveryActive: false, restorePublishing: false, speed: 48, bank: 0, verticalSpeed: 0, flightMode: 'cruise', stall: false });

assert.deepEqual(deriveAerodynamicSound(base), { active: false, airClass: null, gain: 0, cutoff: 900 });
assert.equal(deriveAerodynamicSound({ ...base, verticalSpeed: 12 }).airClass, 'climb');
assert.equal(deriveAerodynamicSound({ ...base, verticalSpeed: -14 }).airClass, 'dive');
assert.equal(deriveAerodynamicSound({ ...base, bank: 0.48 }).airClass, 'bank');
assert.equal(deriveAerodynamicSound({ ...base, bank: 0.5, stall: true }).airClass, 'strain');
assert.equal(deriveAerodynamicSound({ ...base, airborne: false, bank: 0.5 }).active, false);
assert.equal(deriveAerodynamicSound({ ...base, paused: true, bank: 0.5 }).active, false);
assert.equal(deriveAerodynamicSound({ ...base, recoveryActive: true, bank: 0.5 }).active, false);
assert.equal(deriveAerodynamicSound({ ...base, restorePublishing: true, bank: 0.5 }).active, false);
assert.equal(deriveAerodynamicSound({ ...base, speed: Number.NaN, bank: 0.5 }).active, false);

const strained = deriveAerodynamicSound({ ...base, stall: true, speed: 220 });
assert.equal(strained.gain <= 0.04, true);
assert.equal(strained.cutoff <= 2200, true);
assert.deepEqual(Object.keys(aerodynamicSoundPublicState(strained)).sort(), ['active', 'airClass']);
assert.deepEqual(aerodynamicSoundPublicState({ active: true, airClass: 'secret', rawVelocity: [1, 2, 3] }), { active: false, airClass: null });

const caller = { ...base, bank: 0.5 };
deriveAerodynamicSound(caller);
assert.deepEqual(caller, { ...base, bank: 0.5 });
