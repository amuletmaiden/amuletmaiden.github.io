const BANK_START = 0.18;
const BANK_FULL = 0.72;
const SPEED_START = 14;
const SPEED_FULL = 50;
const MAX_SINK = 3.2;

export function deriveBankedTurnVerticalLoad({ airborne = false, bank = 0, planarSpeed = 0 } = {}) {
  if (airborne !== true) return 0;
  const safeBank = Number(bank);
  const safeSpeed = Number(planarSpeed);
  if (!Number.isFinite(safeBank) || !Number.isFinite(safeSpeed) || safeSpeed <= SPEED_START) return 0;

  const bankAmount = smoothstep(clamp((Math.abs(safeBank) - BANK_START) / (BANK_FULL - BANK_START), 0, 1));
  if (bankAmount <= 0) return 0;
  const speedAmount = smoothstep(clamp((safeSpeed - SPEED_START) / (SPEED_FULL - SPEED_START), 0, 1));
  return -MAX_SINK * bankAmount * speedAmount;
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
