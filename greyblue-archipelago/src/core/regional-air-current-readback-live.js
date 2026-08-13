import { deriveRegionalAirCurrentReadback } from "./regional-air-current-readback.js";

const MIN_STABLE_READBACK_SPEED = 24;
const MAX_STABLE_STALL_FACTOR = 0.35;
const LABELS = Object.freeze({
  withwind: "tailwind",
  headwind: "headwind",
  "cross-left": "crosswind left",
  "cross-right": "crosswind right",
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveLiveRegionalAirCurrentReadback({
  airCurrent = null,
  flight = null,
  collision = null,
  recovering = false,
} = {}) {
  const speed = finite(flight?.speed);
  const stallFactor = finite(flight?.stallFactor);
  const stable = Boolean(flight?.airborne)
    && flight?.landingRequested !== true
    && speed !== null
    && speed >= MIN_STABLE_READBACK_SPEED
    && stallFactor !== null
    && stallFactor <= MAX_STABLE_STALL_FACTOR
    && !recovering
    && collision?.grounded !== true
    && collision?.requiresRecovery !== true;

  return deriveRegionalAirCurrentReadback({
    airCurrent,
    yaw: flight?.yaw,
    active: stable,
  });
}

export function regionalAirCurrentReadbackLabel(readback = null) {
  if (readback?.active !== true) return "";
  return LABELS[readback.direction] || "";
}

export const REGIONAL_AIR_CURRENT_READBACK_STABLE_SPEED = MIN_STABLE_READBACK_SPEED;
