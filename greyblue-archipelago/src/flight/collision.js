const DEFAULTS = Object.freeze({
  clearance: 2.5,
  sweepStep: 6,
  maximumSweepSteps: 512,
  safeMargin: 8,
  touchdownMaximumDescent: 8,
  touchdownMaximumHorizontalSpeed: 24,
  touchdownHorizontalRetention: 0.35,
  impactHorizontalRetention: 0.55,
  impactVerticalRetention: 0.35,
  minimumImpactLiftVelocity: 4,
  impactLift: 3.5,
  snagThreshold: 3,
  snagLift: 8,
});

export class FlightCollisionResolver {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.lastSafePosition = null;
    this.consecutiveContacts = 0;
    this.telemetry = neutralTelemetry();
  }

  reset(position = null) {
    this.lastSafePosition = isFiniteVector(position) ? cloneVector(position) : null;
    this.consecutiveContacts = 0;
    this.telemetry = neutralTelemetry();
  }

  resolve({
    previous,
    proposed,
    velocity,
    sampleSurface,
    landingRequested = false,
  }) {
    if (typeof sampleSurface !== "function") {
      throw new TypeError("sampleSurface must be a function");
    }

    if (!isFiniteVector(previous) || !isFiniteVector(proposed) || !isFiniteVector(velocity)) {
      return this.#recoveryResult("non-finite-flight-state");
    }

    const start = cloneVector(previous);
    const destination = cloneVector(proposed);
    const motion = cloneVector(velocity);
    const contact = sweepSurfaceContact(start, destination, sampleSurface, this.options);

    if (!contact) {
      this.consecutiveContacts = 0;
      const destinationSurface = normalizeSurface(sampleSurface(destination.x, destination.z));
      if (destination.y >= destinationSurface.height + this.options.clearance + this.options.safeMargin) {
        this.lastSafePosition = cloneVector(destination);
      }
      this.telemetry = {
        collided: false,
        grounded: false,
        requiresRecovery: false,
        reason: "clear",
        surface: destinationSurface.surface,
        consecutiveContacts: 0,
        sweptSteps: 0,
      };
      return {
        position: destination,
        velocity: motion,
        collided: false,
        grounded: false,
        requiresRecovery: false,
        reason: "clear",
        surface: destinationSurface.surface,
        contact: null,
        telemetry: { ...this.telemetry },
      };
    }

    this.consecutiveContacts += 1;
    const horizontalSpeed = Math.hypot(motion.x, motion.z);
    const descentSpeed = Math.max(0, -motion.y);
    const touchdown = contact.surface.surface !== "water"
      && Boolean(landingRequested)
      && descentSpeed <= this.options.touchdownMaximumDescent
      && horizontalSpeed <= this.options.touchdownMaximumHorizontalSpeed;

    if (contact.surface.surface === "water") {
      return this.#recoveryResult("water-contact", contact);
    }

    if (touchdown) {
      const position = {
        x: contact.point.x,
        y: contact.surface.height + this.options.clearance,
        z: contact.point.z,
      };
      const resolvedVelocity = {
        x: motion.x * this.options.touchdownHorizontalRetention,
        y: 0,
        z: motion.z * this.options.touchdownHorizontalRetention,
      };
      this.lastSafePosition = cloneVector(position);
      this.consecutiveContacts = 0;
      this.telemetry = {
        collided: true,
        grounded: true,
        requiresRecovery: false,
        reason: "touchdown",
        surface: contact.surface.surface,
        consecutiveContacts: 0,
        sweptSteps: contact.step,
      };
      return {
        position,
        velocity: resolvedVelocity,
        collided: true,
        grounded: true,
        requiresRecovery: false,
        reason: "touchdown",
        surface: contact.surface.surface,
        contact,
        telemetry: { ...this.telemetry },
      };
    }

    const snagging = this.consecutiveContacts >= this.options.snagThreshold;
    const extraLift = snagging
      ? this.options.snagLift * (1 + this.consecutiveContacts - this.options.snagThreshold)
      : 0;
    const horizontalRetention = snagging
      ? Math.min(0.28, this.options.impactHorizontalRetention)
      : this.options.impactHorizontalRetention;
    const position = {
      x: contact.point.x,
      y: contact.surface.height + this.options.clearance + this.options.impactLift + extraLift,
      z: contact.point.z,
    };
    const resolvedVelocity = {
      x: motion.x * horizontalRetention,
      y: Math.max(
        this.options.minimumImpactLiftVelocity + (snagging ? this.options.snagLift * 0.5 : 0),
        Math.abs(motion.y) * this.options.impactVerticalRetention,
      ),
      z: motion.z * horizontalRetention,
    };
    this.lastSafePosition = cloneVector(position);
    this.telemetry = {
      collided: true,
      grounded: false,
      requiresRecovery: false,
      reason: snagging ? "snag-escape" : "terrain-impact",
      surface: contact.surface.surface,
      consecutiveContacts: this.consecutiveContacts,
      sweptSteps: contact.step,
    };
    return {
      position,
      velocity: resolvedVelocity,
      collided: true,
      grounded: false,
      requiresRecovery: false,
      reason: this.telemetry.reason,
      surface: contact.surface.surface,
      contact,
      telemetry: { ...this.telemetry },
    };
  }

  #recoveryResult(reason, contact = null) {
    const fallback = this.lastSafePosition || { x: 0, y: 160, z: 220 };
    this.consecutiveContacts = 0;
    this.telemetry = {
      collided: Boolean(contact),
      grounded: false,
      requiresRecovery: true,
      reason,
      surface: contact?.surface?.surface || "unknown",
      consecutiveContacts: 0,
      sweptSteps: contact?.step || 0,
    };
    return {
      position: cloneVector(fallback),
      velocity: { x: 0, y: 0, z: 0 },
      collided: Boolean(contact),
      grounded: false,
      requiresRecovery: true,
      reason,
      surface: this.telemetry.surface,
      contact,
      telemetry: { ...this.telemetry },
    };
  }
}

export function sweepSurfaceContact(previous, proposed, sampleSurface, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  if (!isFiniteVector(previous) || !isFiniteVector(proposed)) return null;
  if (typeof sampleSurface !== "function") {
    throw new TypeError("sampleSurface must be a function");
  }

  const distance = Math.hypot(
    proposed.x - previous.x,
    proposed.y - previous.y,
    proposed.z - previous.z,
  );
  const rawSteps = Math.max(1, Math.ceil(distance / Math.max(settings.sweepStep, 0.01)));
  const steps = Math.min(settings.maximumSweepSteps, rawSteps);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const point = {
      x: lerp(previous.x, proposed.x, t),
      y: lerp(previous.y, proposed.y, t),
      z: lerp(previous.z, proposed.z, t),
    };
    const surface = normalizeSurface(sampleSurface(point.x, point.z));
    if (point.y <= surface.height + settings.clearance) {
      return { point, surface, t, step, steps };
    }
  }
  return null;
}

export function normalizeSurface(value) {
  if (Number.isFinite(Number(value))) {
    const height = Number(value);
    return { height, surface: height > 0 ? "terrain" : "water", id: null };
  }
  if (!value || typeof value !== "object") {
    return { height: 0, surface: "water", id: null };
  }
  const height = Number.isFinite(Number(value.height)) ? Number(value.height) : 0;
  const surface = typeof value.surface === "string" && value.surface
    ? value.surface
    : height > 0 ? "terrain" : "water";
  return {
    height,
    surface,
    id: value.id ?? null,
  };
}

function neutralTelemetry() {
  return {
    collided: false,
    grounded: false,
    requiresRecovery: false,
    reason: "clear",
    surface: "unknown",
    consecutiveContacts: 0,
    sweptSteps: 0,
  };
}

function isFiniteVector(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.z));
}

function cloneVector(value) {
  return {
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
  };
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export { DEFAULTS as COLLISION_DEFAULTS };
