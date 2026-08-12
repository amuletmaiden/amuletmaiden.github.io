import assert from "node:assert/strict";
import { LiveTouchdownSettle } from "../src/core/touchdown-settle-live.js";

const touchdown = Object.freeze({ grounded: true, reason: "touchdown", requiresRecovery: false });
const ordinaryGround = Object.freeze({ grounded: true, reason: "grounded-contact", requiresRecovery: false });
const impact = Object.freeze({ grounded: false, reason: "terrain-impact", requiresRecovery: false });
const recovery = Object.freeze({ grounded: true, reason: "impact", requiresRecovery: true });

const live = new LiveTouchdownSettle();
assert.deepEqual(live.publicState(), { active: false, phase: "complete" });

live.update({ airborne: true, collision: { grounded: false }, dt: 0.016 });
let result = live.update({ collision: touchdown, airborne: false, dt: 0.016 });
assert.deepEqual(result.state, { active: true, phase: "touchdown" });
assert.equal(result.message, "Touchdown. The dragon settles onto the shelf.");

result = live.update({ collision: touchdown, airborne: false, dt: 0.016 });
assert.equal(result.state.phase, "settle");
assert.equal(result.message, null);

const reject = new LiveTouchdownSettle();
reject.update({ airborne: true, collision: { grounded: false } });
assert.equal(reject.update({ collision: ordinaryGround }).message, null);
assert.equal(reject.update({ collision: impact }).message, null);
assert.deepEqual(reject.update({ collision: recovery, recovering: true }).state, { active: false, phase: "complete" });
assert.equal(reject.update({ collision: touchdown }).message, null);
reject.update({ airborne: true, collision: { grounded: false } });
assert.equal(reject.update({ collision: touchdown }).message, "Touchdown. The dragon settles onto the shelf.");

const reduced = new LiveTouchdownSettle();
reduced.update({ airborne: true, collision: { grounded: false } });
result = reduced.update({ collision: touchdown, reducedMotion: true, dt: 0.08 });
assert.equal(result.state.active, true);
result = reduced.update({ collision: ordinaryGround, reducedMotion: true, dt: 0.08 });
assert.deepEqual(result.state, { active: false, phase: "complete" });

assert.deepEqual(touchdown, { grounded: true, reason: "touchdown", requiresRecovery: false });
assert.equal(Object.keys(result.state).sort().join(","), "active,phase");
