import assert from "node:assert/strict";
import { TouchdownSettle, touchdownSettleMessage } from "../src/core/touchdown-settle.js";

const model = new TouchdownSettle();
let result = model.update({ airborne: true, dt: 0.016 });
assert.deepEqual(result.state, { active: false, phase: "complete" });

result = model.update({ touchdown: true, dt: 0.016 });
assert.equal(result.started, true);
assert.deepEqual(result.state, { active: true, phase: "touchdown" });
assert.equal(touchdownSettleMessage(result), "Touchdown. The dragon settles onto the shelf.");

result = model.update({ touchdown: true, dt: 0.016 });
assert.equal(result.started, false);
assert.equal(result.state.phase, "settle");
assert.equal(touchdownSettleMessage(result), null);

for (let i = 0; i < 40; i += 1) result = model.update({ dt: 0.02 });
assert.deepEqual(result.state, { active: false, phase: "complete" });
assert.equal(model.update({ touchdown: true, dt: 0.01 }).started, false);
model.update({ airborne: true, dt: 0.01 });
assert.equal(model.update({ touchdown: true, dt: 0.01 }).started, true);

const interrupted = new TouchdownSettle();
assert.equal(interrupted.update({ airborne: true }).state.active, false);
assert.equal(interrupted.update({ interrupted: true, touchdown: true }).started, false);
assert.equal(interrupted.update({ touchdown: true }).started, false);
interrupted.update({ airborne: true });
assert.equal(interrupted.update({ touchdown: true }).started, true);

const reduced = new TouchdownSettle();
reduced.update({ airborne: true });
result = reduced.update({ touchdown: true, reducedMotion: true, dt: 0.08 });
assert.equal(result.state.active, true);
result = reduced.update({ reducedMotion: true, dt: 0.08 });
assert.deepEqual(result.state, { active: false, phase: "complete" });

const malformed = new TouchdownSettle();
malformed.update({ airborne: true });
result = malformed.update({ touchdown: true, dt: Number.NaN });
assert.equal(result.state.active, true);
assert.equal(Object.keys(result.state).sort().join(","), "active,phase");
