export class ChaseCameraRig {
  constructor({
    distance = 24,
    height = 10,
    lookAhead = 10,
    terrainClearance = 5,
    clearanceSamples = 7,
    recoveryClearance = 36,
    recoveryMinimumAltitude = 72,
    smoothing = 7.5,
  } = {}) {
    this.distance = distance;
    this.height = height;
    this.lookAhead = lookAhead;
    this.terrainClearance = terrainClearance;
    this.clearanceSamples = clampInteger(clearanceSamples, 2, 33, 7);
    this.recoveryClearance = finiteNonNegative(recoveryClearance, 36);
    this.recoveryMinimumAltitude = finiteNonNegative(recoveryMinimumAltitude, 72);
    this.smoothing = smoothing;
    this.position = { x: 0, y: 0, z: 0 };
    this.lookTarget = { x: 0, y: 0, z: 0 };
    this.initialized = false;
    this.obstructed = false;
    this.lastSampleHeight = () => Number.NEGATIVE_INFINITY;
  }

  update({
    target,
    yaw = 0,
    bank = 0,
    speed = 0,
    dt = 1 / 60,
    sampleHeight = this.lastSampleHeight,
  }) {
    if (typeof sampleHeight === "function") this.lastSampleHeight = sampleHeight;
    const activeSampleHeight = typeof sampleHeight === "function"
      ? sampleHeight
      : this.lastSampleHeight;
    const anchor = finiteVector(target) ? target : { x: 0, y: 160, z: 0 };
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const safeBank = Number.isFinite(bank) ? bank : 0;
    const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    const frame = clamp(Number(dt) || 0, 0, 0.1);
    const forward = { x: Math.sin(safeYaw), z: Math.cos(safeYaw) };
    const right = { x: Math.cos(safeYaw), z: -Math.sin(safeYaw) };
    const speedStretch = clamp(safeSpeed / 80, 0, 1) * 8;
    const bankOffset = clamp(safeBank, -0.8, 0.8) * 4.5;
    const desiredDistance = this.distance + speedStretch;

    const desired = {
      x: anchor.x - forward.x * desiredDistance - right.x * bankOffset,
      y: anchor.y + this.height + Math.min(safeSpeed * 0.035, 3.5),
      z: anchor.z - forward.z * desiredDistance - right.z * bankOffset,
    };

    const terrainHeight = maximumFiniteHeightAlongSegment(
      anchor,
      desired,
      activeSampleHeight,
      this.clearanceSamples,
    );
    const minimumCameraHeight = Number.isFinite(terrainHeight)
      ? terrainHeight + this.terrainClearance
      : Number.NEGATIVE_INFINITY;
    this.obstructed = desired.y < minimumCameraHeight;
    if (this.obstructed) desired.y = minimumCameraHeight;

    const lookDistance = this.lookAhead + clamp(safeSpeed * 0.11, 0, 8);
    const desiredLook = {
      x: anchor.x + forward.x * lookDistance,
      y: anchor.y + 3.5 - clamp(safeBank * 1.2, -1, 1),
      z: anchor.z + forward.z * lookDistance,
    };

    if (!this.initialized || !finiteVector(this.position) || !finiteVector(this.lookTarget)) {
      this.position = { ...desired };
      this.lookTarget = { ...desiredLook };
      this.initialized = true;
    } else {
      const response = 1 - Math.exp(-this.smoothing * frame);
      lerpVector(this.position, desired, response);
      lerpVector(this.lookTarget, desiredLook, response);
      if (this.obstructed && this.position.y < minimumCameraHeight) {
        this.position.y = minimumCameraHeight;
      }
    }

    if (!finiteVector(this.position) || !finiteVector(this.lookTarget)) {
      this.position = { x: anchor.x, y: anchor.y + this.height, z: anchor.z - this.distance };
      this.lookTarget = { x: anchor.x, y: anchor.y + 3.5, z: anchor.z };
      this.obstructed = false;
    }

    return this.snapshot();
  }

  snapTo(target, yaw = 0, sampleHeight = this.lastSampleHeight) {
    const safeAltitude = resolveRecoveryAltitude(target, sampleHeight, {
      terrainClearance: this.recoveryClearance,
      minimumAltitude: this.recoveryMinimumAltitude,
    });
    if (target && typeof target === "object") target.y = safeAltitude;
    this.initialized = false;
    return this.update({ target, yaw, dt: 0, sampleHeight });
  }

  snapshot() {
    return {
      position: { ...this.position },
      lookTarget: { ...this.lookTarget },
      obstructed: this.obstructed,
      distance: Math.hypot(
        this.lookTarget.x - this.position.x,
        this.lookTarget.y - this.position.y,
        this.lookTarget.z - this.position.z,
      ),
    };
  }
}

export function resolveRecoveryAltitude(
  target,
  sampleHeight,
  { terrainClearance = 36, minimumAltitude = 72 } = {},
) {
  const baseAltitude = Number.isFinite(Number(target?.y)) ? Number(target.y) : 0;
  const floorAltitude = finiteNonNegative(minimumAltitude, 72);
  const clearance = finiteNonNegative(terrainClearance, 36);
  if (!finiteHorizontal(target) || typeof sampleHeight !== "function") {
    return Math.max(baseAltitude, floorAltitude);
  }
  const sampled = sampleHeight(Number(target.x), Number(target.z));
  const terrainHeight = normalizeHeight(sampled);
  return Number.isFinite(terrainHeight)
    ? Math.max(baseAltitude, floorAltitude, terrainHeight + clearance)
    : Math.max(baseAltitude, floorAltitude);
}

export function maximumFiniteHeightAlongSegment(start, end, sampleHeight, samples = 7) {
  if (!finiteVector(start) || !finiteVector(end) || typeof sampleHeight !== "function") {
    return Number.NEGATIVE_INFINITY;
  }
  const count = clampInteger(samples, 2, 33, 7);
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const amount = index / (count - 1);
    const x = start.x + (end.x - start.x) * amount;
    const z = start.z + (end.z - start.z) * amount;
    const height = normalizeHeight(sampleHeight(x, z));
    if (Number.isFinite(height)) maximum = Math.max(maximum, height);
  }
  return maximum;
}

function normalizeHeight(sampled) {
  if (sampled === null || sampled === undefined) return Number.NEGATIVE_INFINITY;
  if (typeof sampled === "object") {
    const height = Number(sampled.height);
    return Number.isFinite(height) ? height : Number.NEGATIVE_INFINITY;
  }
  const height = Number(sampled);
  return Number.isFinite(height) ? height : Number.NEGATIVE_INFINITY;
}

function lerpVector(current, target, amount) {
  current.x += (target.x - current.x) * amount;
  current.y += (target.y - current.y) * amount;
  current.z += (target.z - current.z) * amount;
}

function finiteHorizontal(value) {
  return Boolean(value)
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.z));
}

function finiteVector(value) {
  return Boolean(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? clamp(number, minimum, maximum) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
