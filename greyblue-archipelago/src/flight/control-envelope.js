const DEFAULTS = Object.freeze({
  rollRiseRate: 4.8,
  rollFallRate: 6.4,
  throttleRiseRate: 1.8,
  throttleFallRate: 2.8,
  coordinationGain: 0.42,
  coordinationMax: 0.46,
  counterSteerYield: 0.82,
  stallEnter: 0.58,
  stallExit: 0.24,
  recoveryThrottleFloor: 0.26,
});

export function createControlEnvelopeState(initial = {}) {
  return {
    rollCommand: finiteClamp(initial.rollCommand, -1, 1, 0),
    throttleCommand: finiteClamp(initial.throttleCommand, -1, 1, 0),
    recoveryEngaged: Boolean(initial.recoveryEngaged),
  };
}

export function stepControlEnvelope(state, input, flight, dt, config = {}) {
  const previous = createControlEnvelopeState(state);
  const settings = normalizeConfig(config);
  const frame = finiteClamp(dt, 0, 0.05, 0);
  const rollInput = finiteClamp(input?.roll ?? input?.steer, -1, 1, 0);
  const yawInput = finiteClamp(input?.yaw ?? input?.steer, -1, 1, 0);
  const throttleInput = finiteClamp(input?.throttle, -1, 1, 0);
  const airspeed = Math.max(0, finiteNumber(flight?.airspeed, 0));
  const bank = finiteClamp(flight?.bank, -Math.PI / 2, Math.PI / 2, 0);
  const stallPressure = finiteClamp(flight?.stallPressure, 0, 1, 0);
  const landing = Boolean(flight?.landingRequested);
  const airborne = flight?.airborne !== false;

  const rollRate = Math.abs(rollInput) > Math.abs(previous.rollCommand)
    ? settings.rollRiseRate
    : settings.rollFallRate;
  const rollCommand = approach(previous.rollCommand, rollInput, rollRate * frame);

  const throttleRate = throttleInput > previous.throttleCommand
    ? settings.throttleRiseRate
    : settings.throttleFallRate;
  let throttleCommand = approach(previous.throttleCommand, throttleInput, throttleRate * frame);

  let recoveryEngaged = previous.recoveryEngaged;
  if (!airborne || landing || stallPressure <= settings.stallExit) {
    recoveryEngaged = false;
  } else if (stallPressure >= settings.stallEnter) {
    recoveryEngaged = true;
  }

  if (recoveryEngaged && !landing) {
    throttleCommand = Math.max(throttleCommand, settings.recoveryThrottleFloor);
  }

  const speedAuthority = clamp(airspeed / 32, 0, 1);
  const bankAuthority = clamp(Math.abs(bank) / 0.72, 0, 1);
  const deliberateCounterSteer = Math.sign(yawInput) !== 0
    && Math.sign(bank) !== 0
    && Math.sign(yawInput) !== Math.sign(bank);
  const counterSteerScale = deliberateCounterSteer
    ? 1 - settings.counterSteerYield * Math.abs(yawInput)
    : 1;
  const coordinatedYaw = clamp(
    Math.sign(bank) * bankAuthority * speedAuthority * settings.coordinationGain * counterSteerScale,
    -settings.coordinationMax,
    settings.coordinationMax,
  );
  const yawCommand = clamp(yawInput + coordinatedYaw, -1, 1);

  return {
    state: {
      rollCommand,
      throttleCommand,
      recoveryEngaged,
    },
    commands: {
      roll: rollCommand,
      yaw: yawCommand,
      throttle: throttleCommand,
    },
    telemetry: {
      mode: !airborne ? "grounded" : landing ? "landing" : recoveryEngaged ? "recovery" : "flight",
      rollSaturated: Math.abs(rollCommand) >= 0.999,
      throttleSaturated: Math.abs(throttleCommand) >= 0.999,
      coordinationAuthority: coordinatedYaw,
      recoveryEngaged,
    },
  };
}

function normalizeConfig(config) {
  return {
    rollRiseRate: positive(config.rollRiseRate, DEFAULTS.rollRiseRate),
    rollFallRate: positive(config.rollFallRate, DEFAULTS.rollFallRate),
    throttleRiseRate: positive(config.throttleRiseRate, DEFAULTS.throttleRiseRate),
    throttleFallRate: positive(config.throttleFallRate, DEFAULTS.throttleFallRate),
    coordinationGain: finiteClamp(config.coordinationGain, 0, 1, DEFAULTS.coordinationGain),
    coordinationMax: finiteClamp(config.coordinationMax, 0, 1, DEFAULTS.coordinationMax),
    counterSteerYield: finiteClamp(config.counterSteerYield, 0, 1, DEFAULTS.counterSteerYield),
    stallEnter: finiteClamp(config.stallEnter, 0, 1, DEFAULTS.stallEnter),
    stallExit: finiteClamp(config.stallExit, 0, 1, DEFAULTS.stallExit),
    recoveryThrottleFloor: finiteClamp(config.recoveryThrottleFloor, -1, 1, DEFAULTS.recoveryThrottleFloor),
  };
}

function approach(current, target, maxDelta) {
  if (target > current) return Math.min(target, current + maxDelta);
  if (target < current) return Math.max(target, current - maxDelta);
  return current;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteClamp(value, min, max, fallback) {
  return clamp(finiteNumber(value, fallback), min, max);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
