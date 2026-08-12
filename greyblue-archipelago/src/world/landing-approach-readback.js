const MIN_TOWARD_DOT = 0.3;
const LANE_MARGIN = 0.72;
const LINED_FRACTION = 0.2;

export function deriveLandingApproachReadback({
  eligible,
  airborne,
  interrupted = false,
  position,
  yaw,
  verticalVelocity,
  corridor,
} = {}) {
  if (!eligible || !airborne || interrupted) return inactive();

  const px = Number(position?.x);
  const pz = Number(position?.z);
  const heading = Number(yaw);
  const vertical = Number(verticalVelocity);
  const ex = Number(corridor?.entry?.x);
  const ez = Number(corridor?.entry?.z);
  const tx = Number(corridor?.touchdown?.x);
  const tz = Number(corridor?.touchdown?.z);
  const width = Number(corridor?.width);
  const maximumDescentRate = Number(corridor?.maximumDescentRate);
  const values = [px, pz, heading, vertical, ex, ez, tx, tz, width, maximumDescentRate];
  if (!values.every(Number.isFinite) || width <= 0 || maximumDescentRate <= 0) return inactive();

  const dx = tx - ex;
  const dz = tz - ez;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 1) return inactive();

  const ux = dx / length;
  const uz = dz / length;
  const rx = px - ex;
  const rz = pz - ez;
  const along = rx * ux + rz * uz;
  const lateral = -uz * rx + ux * rz;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const towardDot = forwardX * ux + forwardZ * uz;

  if (along < -length * 0.16 || along > length * 1.08) return inactive();
  if (Math.abs(lateral) > width * LANE_MARGIN) return inactive();
  if (towardDot < MIN_TOWARD_DOT) return inactive();

  const alignment = Math.abs(lateral) <= width * LINED_FRACTION
    ? "lined"
    : lateral < 0 ? "left" : "right";
  const descentRate = Math.max(0, -vertical);
  const descentRatio = descentRate / maximumDescentRate;
  const descent = descentRatio < 0.08 ? "shallow" : descentRatio <= 0.35 ? "steady" : "steep";

  return Object.freeze({ active: true, alignment, descent });
}

function inactive() {
  return Object.freeze({ active: false, alignment: null, descent: null });
}
