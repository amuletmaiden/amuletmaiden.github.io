const MIN_CURRENT_MAGNITUDE = 0.65;
const FORWARD_BAND = Math.cos(Math.PI * 0.31);

const INACTIVE = Object.freeze({ active: false, direction: null });

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveRegionalAirCurrentReadback({
  airCurrent = null,
  yaw = 0,
  active = false,
} = {}) {
  if (!active) return INACTIVE;

  const x = finite(airCurrent?.x);
  const z = finite(airCurrent?.z);
  const heading = finite(yaw);
  if (x === null || z === null || heading === null) return INACTIVE;

  const magnitude = Math.hypot(x, z);
  if (magnitude < MIN_CURRENT_MAGNITUDE) return INACTIVE;

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const along = (x * forwardX + z * forwardZ) / magnitude;
  const across = (x * rightX + z * rightZ) / magnitude;

  let direction;
  if (along >= FORWARD_BAND) direction = "withwind";
  else if (along <= -FORWARD_BAND) direction = "headwind";
  else direction = across >= 0 ? "cross-right" : "cross-left";

  return Object.freeze({ active: true, direction });
}

export const REGIONAL_AIR_CURRENT_READBACK_MIN_MAGNITUDE = MIN_CURRENT_MAGNITUDE;
