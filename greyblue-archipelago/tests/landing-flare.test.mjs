import assert from "node:assert/strict";
import {
  BASE_LANDING_DESCENT,
  deriveLandingVerticalTarget,
  SOFTEST_FLARE_DESCENT,
} from "../src/flight/landing-flare.js";

const base = {
  airborne: true,
  landingRequested: true,
  takeoffActive: false,
  climb: 0,
  ordinaryTargetVertical: -1.6,
};

assert.equal(
  deriveLandingVerticalTarget(base),
  BASE_LANDING_DESCENT,
  "neutral landing input preserves the existing -6.5 descent target",
);

const halfFlare = deriveLandingVerticalTarget({ ...base, climb: 0.5 });
assert.ok(halfFlare > BASE_LANDING_DESCENT, "positive climb eases committed landing descent");
assert.ok(halfFlare < 0, "partial flare remains descending");

assert.equal(
  deriveLandingVerticalTarget({ ...base, climb: 1 }),
  SOFTEST_FLARE_DESCENT,
  "full flare reaches only the bounded still-negative descent floor",
);
assert.ok(SOFTEST_FLARE_DESCENT < 0, "full flare can never command level or upward flight");

const levels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((climb) => (
  deriveLandingVerticalTarget({ ...base, climb })
));
for (let index = 1; index < levels.length; index += 1) {
  assert.ok(levels[index] >= levels[index - 1], "more positive climb never makes the flare descend harder");
  assert.ok(levels[index] < 0, "every flare level remains a descent");
}

assert.equal(
  deriveLandingVerticalTarget({ ...base, climb: -1, ordinaryTargetVertical: -18.6 }),
  -18.6,
  "negative climb keeps stronger ordinary descent authority",
);
assert.equal(
  deriveLandingVerticalTarget({ ...base, climb: 1, ordinaryTargetVertical: -10 }),
  -10,
  "a more-negative safety target remains authoritative over full flare",
);

for (const state of [
  { airborne: false },
  { landingRequested: false },
  { takeoffActive: true },
  { climb: Number.NaN },
]) {
  assert.equal(
    deriveLandingVerticalTarget({ ...base, ...state }),
    base.ordinaryTargetVertical,
    "ineligible or malformed flare input leaves the ordinary vertical target untouched",
  );
}

assert.ok(
  Number.isNaN(deriveLandingVerticalTarget({ ...base, ordinaryTargetVertical: Number.NaN })),
  "non-finite controller target remains visible to the existing controller repair path",
);

const caller = { ...base, climb: 0.7 };
const before = { ...caller };
deriveLandingVerticalTarget(caller);
assert.deepEqual(caller, before, "flare derivation does not mutate caller state");

console.log("landing flare tests passed");
