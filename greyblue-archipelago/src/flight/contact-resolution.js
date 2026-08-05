const DEFAULTS = Object.freeze({
  touchdownMaxDownSpeed: 3.25,
  touchdownMaxHorizontalSpeed: 12,
  crashDownSpeed: 8,
  crashHorizontalSpeed: 24,
  separationRate: 10,
  maxCorrectionPerStep: 1.5,
  recoveryDamping: 0.35,
  relaunchClearance: 0.35,
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cloneVector = (value = {}) => ({
  x: finite(value.x),
  y: finite(value.y),
  z: finite(value.z),
});

export function createContactState() {
  return Object.freeze({ mode: 'airborne', separation: 0, grounded: false });
}

export function resolveContact(input = {}, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const previous = input.previous ?? createContactState();
  const position = cloneVector(input.position);
  const velocity = cloneVector(input.velocity);
  const dt = clamp(finite(input.dt, 1 / 60), 1 / 240, 0.25);
  const sample = input.contact ?? null;

  if (!sample || sample.hit !== true) {
    const relaunching = previous.grounded && position.y > finite(input.surfaceHeight) + cfg.relaunchClearance;
    return Object.freeze({
      position: Object.freeze(position),
      velocity: Object.freeze(velocity),
      state: Object.freeze({
        mode: relaunching ? 'airborne' : previous.mode === 'landed' ? 'landed' : 'airborne',
        separation: 0,
        grounded: relaunching ? false : previous.grounded,
      }),
      telemetry: Object.freeze({ contactKind: 'none', correction: 0, recoveryReason: null, fallbackUsed: false }),
    });
  }

  const fallbackUsed = !Number.isFinite(sample.penetration) || !Number.isFinite(sample.normal?.y);
  const penetration = clamp(finite(sample.penetration), 0, cfg.maxCorrectionPerStep * 4);
  const normal = cloneVector(sample.normal ?? { y: 1 });
  const normalLength = Math.hypot(normal.x, normal.y, normal.z) || 1;
  normal.x /= normalLength;
  normal.y /= normalLength;
  normal.z /= normalLength;

  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  const downSpeed = Math.max(0, -velocity.y);
  const deliberateLanding = input.flightMode === 'approach' || input.flightMode === 'landing';
  const shallow = downSpeed <= cfg.touchdownMaxDownSpeed && horizontalSpeed <= cfg.touchdownMaxHorizontalSpeed;
  const severe = downSpeed >= cfg.crashDownSpeed || horizontalSpeed >= cfg.crashHorizontalSpeed;
  const contactKind = deliberateLanding && shallow ? 'touchdown' : severe ? 'crash' : 'recovery';

  const desiredCorrection = Math.max(penetration, finite(previous.separation));
  const correction = clamp(desiredCorrection * cfg.separationRate * dt, 0, cfg.maxCorrectionPerStep);
  const correctedPosition = {
    x: position.x + normal.x * correction,
    y: position.y + normal.y * correction,
    z: position.z + normal.z * correction,
  };

  let correctedVelocity;
  if (contactKind === 'touchdown') {
    correctedVelocity = { x: velocity.x * 0.94, y: Math.max(0, velocity.y), z: velocity.z * 0.94 };
  } else {
    const inward = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
    const remove = Math.min(0, inward);
    correctedVelocity = {
      x: (velocity.x - normal.x * remove) * cfg.recoveryDamping,
      y: Math.max(0, velocity.y - normal.y * remove) * cfg.recoveryDamping,
      z: (velocity.z - normal.z * remove) * cfg.recoveryDamping,
    };
  }

  const remaining = Math.max(0, desiredCorrection - correction);
  return Object.freeze({
    position: Object.freeze(correctedPosition),
    velocity: Object.freeze(correctedVelocity),
    state: Object.freeze({
      mode: contactKind === 'touchdown' ? 'landed' : 'recovering',
      separation: remaining,
      grounded: contactKind === 'touchdown',
    }),
    telemetry: Object.freeze({
      contactKind,
      correction,
      recoveryReason: contactKind === 'touchdown' ? null : severe ? 'high-energy-contact' : 'unstable-contact',
      fallbackUsed,
    }),
  });
}

export { DEFAULTS as CONTACT_RESOLUTION_DEFAULTS };
