const DEFAULTS = Object.freeze({
  clearance: 2.5,
  sweepStep: 6,
  maximumSweepSteps: 512,
  safeMargin: 8,
  shorelineTransitionDistance: 12,
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
    this.lastSafeTerrainPosition = null;
    this.consecutiveContacts = 0;
    this.telemetry = neutralTelemetry();
  }

  reset(position = null, surface = null) {
    this.lastSafePosition = isFiniteVector(position) ? cloneVector(position) : null;
    const normalized = surface === null ? null : normalizeSurface(surface);
    this.lastSafeTerrainPosition = isFiniteVector(position)
      && normalized?.valid
      && normalized.surface !== "water"
      ? cloneVector(position)
      : null;
    this.consecutiveContacts = 0;
    this.telemetry = neutralTelemetry();
  }

  resolve({ previous, proposed, velocity, sampleSurface, landingRequested = false, airborne = true }) {
    if (typeof sampleSurface !== "function") throw new TypeError("sampleSurface must be a function");
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
      if (destinationSurface.valid && destination.y >= destinationSurface.height + this.options.clearance + this.options.safeMargin) {
        this.lastSafePosition = cloneVector(destination);
        if (destinationSurface.surface !== "water") this.lastSafeTerrainPosition = cloneVector(destination);
      }
      this.telemetry = { collided: false, grounded: false, requiresRecovery: false, reason: "clear", surface: destinationSurface.valid ? destinationSurface.surface : "unknown", terrainValidity: destinationSurface.validity, consecutiveContacts: 0, sweptSteps: 0 };
      return { position: destination, velocity: motion, collided: false, grounded: false, requiresRecovery: false, reason: "clear", surface: this.telemetry.surface, contact: null, telemetry: { ...this.telemetry } };
    }
    this.consecutiveContacts += 1;
    const horizontalSpeed = Math.hypot(motion.x, motion.z);
    const descentSpeed = Math.max(0, -motion.y);
    const settledGround = contact.surface.surface !== "water" && !airborne;
    const touchdown = contact.surface.surface !== "water" && Boolean(landingRequested) && descentSpeed <= this.options.touchdownMaximumDescent && horizontalSpeed <= this.options.touchdownMaximumHorizontalSpeed;
    if (contact.surface.surface === "water") return this.#recoveryResult("water-contact", contact, true);
    if (settledGround || touchdown) {
      const reason = settledGround ? "grounded-contact" : "touchdown";
      const retention = settledGround ? 1 : this.options.touchdownHorizontalRetention;
      const position = { x: contact.point.x, y: contact.surface.height + this.options.clearance, z: contact.point.z };
      const resolvedVelocity = { x: motion.x * retention, y: 0, z: motion.z * retention };
      this.lastSafePosition = cloneVector(position);
      this.lastSafeTerrainPosition = cloneVector(position);
      this.consecutiveContacts = 0;
      this.telemetry = { collided: true, grounded: true, requiresRecovery: false, reason, surface: contact.surface.surface, terrainValidity: contact.surface.validity, consecutiveContacts: 0, sweptSteps: contact.step };
      return { position, velocity: resolvedVelocity, collided: true, grounded: true, requiresRecovery: false, reason, surface: contact.surface.surface, contact, telemetry: { ...this.telemetry } };
    }
    const snagging = this.consecutiveContacts >= this.options.snagThreshold;
    const extraLift = snagging ? this.options.snagLift * (1 + this.consecutiveContacts - this.options.snagThreshold) : 0;
    const horizontalRetention = snagging ? Math.min(0.28, this.options.impactHorizontalRetention) : this.options.impactHorizontalRetention;
    const position = { x: contact.point.x, y: contact.surface.height + this.options.clearance + this.options.impactLift + extraLift, z: contact.point.z };
    const resolvedVelocity = { x: motion.x * horizontalRetention, y: Math.max(this.options.minimumImpactLiftVelocity + (snagging ? this.options.snagLift * 0.5 : 0), Math.abs(motion.y) * this.options.impactVerticalRetention), z: motion.z * horizontalRetention };
    this.lastSafePosition = cloneVector(position);
    this.lastSafeTerrainPosition = cloneVector(position);
    this.telemetry = { collided: true, grounded: false, requiresRecovery: false, reason: snagging ? "snag-escape" : "terrain-impact", surface: contact.surface.surface, terrainValidity: contact.surface.validity, consecutiveContacts: this.consecutiveContacts, sweptSteps: contact.step };
    return { position, velocity: resolvedVelocity, collided: true, grounded: false, requiresRecovery: false, reason: this.telemetry.reason, surface: contact.surface.surface, contact, telemetry: { ...this.telemetry } };
  }

  #recoveryResult(reason, contact = null, preferTerrain = false) {
    const fallback = preferTerrain ? this.lastSafeTerrainPosition || this.lastSafePosition || { x: 0, y: 160, z: 0 } : this.lastSafePosition || this.lastSafeTerrainPosition || { x: 0, y: 160, z: 0 };
    this.consecutiveContacts = 0;
    this.telemetry = { collided: Boolean(contact), grounded: false, requiresRecovery: true, reason, surface: contact?.surface?.surface || "unknown", terrainValidity: contact?.surface?.validity || "missing", consecutiveContacts: 0, sweptSteps: contact?.step || 0 };
    return { position: cloneVector(fallback), velocity: { x: 0, y: 0, z: 0 }, collided: Boolean(contact), grounded: false, requiresRecovery: true, reason, surface: this.telemetry.surface, contact, telemetry: { ...this.telemetry } };
  }
}

export function sweepSurfaceContact(previous, proposed, sampleSurface, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  if (!isFiniteVector(previous) || !isFiniteVector(proposed)) return null;
  if (typeof sampleSurface !== "function") throw new TypeError("sampleSurface must be a function");
  const distance = Math.hypot(proposed.x - previous.x, proposed.y - previous.y, proposed.z - previous.z);
  const rawSteps = Math.max(1, Math.ceil(distance / Math.max(settings.sweepStep, 0.01)));
  const steps = Math.min(settings.maximumSweepSteps, rawSteps);
  let firstWaterContact = null;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const point = { x: lerp(previous.x, proposed.x, t), y: lerp(previous.y, proposed.y, t), z: lerp(previous.z, proposed.z, t) };
    const surface = normalizeSurface(sampleSurface(point.x, point.z));
    if (!surface.valid || point.y > surface.height + settings.clearance) continue;
    const contact = { point, surface, t, step, steps };
    if (surface.surface !== "water") {
      if (!firstWaterContact || horizontalDistance(firstWaterContact.point, point) <= finiteNonNegative(settings.shorelineTransitionDistance, DEFAULTS.shorelineTransitionDistance)) return contact;
      return firstWaterContact;
    }
    if (!firstWaterContact) firstWaterContact = contact;
  }
  return firstWaterContact;
}

export function normalizeSurface(value) {
  if (value === null || value === undefined) return invalidSurface("missing");
  if (typeof value !== "object") {
    const height = Number(value);
    if (!Number.isFinite(height)) return invalidSurface("non-finite");
    return { height, surface: height > 0 ? "terrain" : "water", id: null, valid: true, validity: "valid" };
  }
  const declaredValidity = normalizeValidity(value);
  if (["missing", "non-finite", "out-of-bounds"].includes(declaredValidity)) return invalidSurface(declaredValidity, value.id ?? null);
  const height = Number(value.height);
  if (!Number.isFinite(height)) return invalidSurface("non-finite", value.id ?? null);
  const surface = typeof value.surface === "string" && value.surface ? value.surface : height > 0 ? "terrain" : "water";
  return { height, surface, id: value.id ?? null, valid: true, validity: declaredValidity };
}

function normalizeValidity(value) {
  if (value.valid === false || value.outOfBounds === true) return "out-of-bounds";
  if (value.missing === true) return "missing";
  const label = typeof value.validity === "string" ? value.validity.toLowerCase() : "";
  if (["missing", "non-finite", "out-of-bounds"].includes(label)) return label;
  if (label === "sparse" || value.sparse === true) return "sparse";
  return "valid";
}
function invalidSurface(validity, id = null) { return { height: 0, surface: "unknown", id, valid: false, validity }; }
function neutralTelemetry() { return { collided: false, grounded: false, requiresRecovery: false, reason: "clear", surface: "unknown", terrainValidity: "missing", consecutiveContacts: 0, sweptSteps: 0 }; }
function isFiniteVector(value) { return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z)); }
function cloneVector(value) { return { x: Number(value.x), y: Number(value.y), z: Number(value.z) }; }
function horizontalDistance(a, b) { return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z)); }
function finiteNonNegative(value, fallback) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
function lerp(start, end, amount) { return start + (end - start) * amount; }
export { DEFAULTS as COLLISION_DEFAULTS };
