const NEUTRAL_STEER = 0.08;
const MIN_BANK = 0.12;
const FULL_BANK = 0.7;
const MIN_SPEED = 22;
const FULL_SPEED = 55;
const MAX_CARRY_STEER = 0.22;

export function deriveBankTurnCarry({
  airborne,
  landingRequested = false,
  takeoffActive = false,
  stallPressure = 0,
  steer,
  bank,
  planarSpeed,
} = {}) {
  const input = Number(steer);
  const bankAngle = Number(bank);
  const speed = Number(planarSpeed);
  const stall = Number(stallPressure);

  if (
    !airborne ||
    landingRequested ||
    takeoffActive ||
    !Number.isFinite(input) ||
    !Number.isFinite(bankAngle) ||
    !Number.isFinite(speed) ||
    !Number.isFinite(stall) ||
    Math.abs(input) > NEUTRAL_STEER ||
    Math.abs(bankAngle) < MIN_BANK ||
    speed < MIN_SPEED ||
    stall > 0
  ) {
    return 0;
  }

  const bankStrength = clamp((Math.abs(bankAngle) - MIN_BANK) / (FULL_BANK - MIN_BANK), 0, 1);
  const speedStrength = clamp((speed - MIN_SPEED) / (FULL_SPEED - MIN_SPEED), 0, 1);
  return Math.sign(bankAngle) * MAX_CARRY_STEER * bankStrength * speedStrength;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
