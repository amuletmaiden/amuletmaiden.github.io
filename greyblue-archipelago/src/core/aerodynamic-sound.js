const AIR_CLASSES = Object.freeze(['climb', 'dive', 'bank', 'strain']);

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanClass(value) {
  return AIR_CLASSES.includes(value) ? value : null;
}

export function deriveAerodynamicSound(frame = {}) {
  const speed = finite(frame.speed);
  const bank = finite(frame.bank);
  const verticalSpeed = finite(frame.verticalSpeed);
  const strain = frame.stall === true || frame.flightMode === 'stall' || frame.flightMode === 'strained';
  const eligible = frame.ready === true
    && frame.paused !== true
    && frame.airborne === true
    && frame.recoveryActive !== true
    && frame.restorePublishing !== true
    && speed != null
    && speed >= 18;

  if (!eligible) return Object.freeze({ active: false, airClass: null, gain: 0, cutoff: 900 });

  let airClass = null;
  if (strain) airClass = 'strain';
  else if (bank != null && Math.abs(bank) >= 0.34 && speed >= 30) airClass = 'bank';
  else if (verticalSpeed != null && verticalSpeed >= 8 && speed >= 24) airClass = 'climb';
  else if (verticalSpeed != null && verticalSpeed <= -10 && speed >= 24) airClass = 'dive';

  if (!airClass) return Object.freeze({ active: false, airClass: null, gain: 0, cutoff: 900 });

  const speedPressure = clamp((speed - 18) / 82, 0, 1);
  const classGain = Object.freeze({ climb: 0.014, dive: 0.02, bank: 0.017, strain: 0.026 })[airClass];
  const classCutoff = Object.freeze({ climb: 1320, dive: 1780, bank: 1510, strain: 1120 })[airClass];
  return Object.freeze({
    active: true,
    airClass,
    gain: clamp(classGain + speedPressure * 0.012, 0, 0.04),
    cutoff: clamp(classCutoff + speedPressure * 260, 900, 2200),
  });
}

export function aerodynamicSoundPublicState(view) {
  const airClass = cleanClass(view?.airClass);
  return Object.freeze({ active: Boolean(view?.active && airClass), airClass });
}
