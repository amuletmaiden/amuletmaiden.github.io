const MAX_YAW_OFFSET = 1.55;
const MAX_PITCH_UP = 0.58;
const MAX_PITCH_DOWN = -0.68;
const LOOK_RATE = 2.15;
const RECENTER_RESPONSE = 4.8;
const INPUT_DEADZONE = 0.06;

const ZERO = Object.freeze({ yawOffset: 0, pitchOffset: 0, active: false });

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedAxis(value) {
  const axis = clamp(finite(value), -1, 1);
  return Math.abs(axis) < INPUT_DEADZONE ? 0 : axis;
}

export function stepCameraFreeLook(previous = ZERO, {
  lookX = 0,
  lookY = 0,
  dt = 0,
  interrupted = false,
  reducedMotion = false,
} = {}) {
  if (interrupted) return ZERO;

  const frame = clamp(finite(dt), 0, 0.05);
  const x = normalizedAxis(lookX);
  const y = normalizedAxis(lookY);
  let yawOffset = clamp(finite(previous?.yawOffset), -MAX_YAW_OFFSET, MAX_YAW_OFFSET);
  let pitchOffset = clamp(finite(previous?.pitchOffset), MAX_PITCH_DOWN, MAX_PITCH_UP);

  if (x || y) {
    yawOffset = clamp(yawOffset + x * LOOK_RATE * frame, -MAX_YAW_OFFSET, MAX_YAW_OFFSET);
    pitchOffset = clamp(pitchOffset + y * LOOK_RATE * frame, MAX_PITCH_DOWN, MAX_PITCH_UP);
  } else if (frame > 0) {
    const response = reducedMotion ? RECENTER_RESPONSE * 1.8 : RECENTER_RESPONSE;
    const blend = 1 - Math.exp(-response * frame);
    yawOffset += (0 - yawOffset) * blend;
    pitchOffset += (0 - pitchOffset) * blend;
    if (Math.abs(yawOffset) < 0.001) yawOffset = 0;
    if (Math.abs(pitchOffset) < 0.001) pitchOffset = 0;
  }

  const active = Boolean(x || y || Math.abs(yawOffset) > 0.002 || Math.abs(pitchOffset) > 0.002);
  return Object.freeze({ yawOffset, pitchOffset, active });
}

export function resetCameraFreeLook() {
  return ZERO;
}

export function cameraFreeLookTelemetry(state = ZERO) {
  const yaw = clamp(finite(state?.yawOffset), -MAX_YAW_OFFSET, MAX_YAW_OFFSET);
  const pitch = clamp(finite(state?.pitchOffset), MAX_PITCH_DOWN, MAX_PITCH_UP);
  const active = state?.active === true && (Math.abs(yaw) > 0.002 || Math.abs(pitch) > 0.002);
  let direction = null;
  if (active) {
    if (Math.abs(yaw) >= Math.abs(pitch)) direction = yaw < 0 ? 'left' : 'right';
    else direction = pitch < 0 ? 'down' : 'up';
  }
  return Object.freeze({ active, direction });
}

export const CAMERA_FREE_LOOK_LIMITS = Object.freeze({
  yaw: MAX_YAW_OFFSET,
  pitchUp: MAX_PITCH_UP,
  pitchDown: MAX_PITCH_DOWN,
});
