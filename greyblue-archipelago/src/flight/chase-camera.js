import {
  clearGroundedCameraSettle,
  createGroundedCameraSettleState,
  groundedCameraComposition,
  stepGroundedCameraSettle,
} from "./grounded-camera-settle.js";

export class ChaseCameraRig {
  constructor({
    distance = 24,
    height = 10,
    lookAhead = 10,
    terrainClearance = 5,
    clearanceSamples = 7,
    clearanceProbeSpacing = 0.5,
    maximumClearanceSamples = 129,
    minimumObstructedDistance = 9,
    obstructionDistanceSamples = 8,
    obstructionReleaseFrames = 3,
    recoveryClearance = 36,
    recoveryMinimumAltitude = 72,
    smoothing = 7.5,
  } = {}) {
    this.distance = distance;
    this.height = height;
    this.lookAhead = lookAhead;
    this.terrainClearance = terrainClearance;
    this.clearanceSamples = clampInteger(clearanceSamples, 2, 33, 7);
    this.clearanceProbeSpacing = finitePositive(clearanceProbeSpacing, 0.5);
    this.maximumClearanceSamples = clampInteger(maximumClearanceSamples, 2, 513, 129);
    this.minimumObstructedDistance = finitePositive(minimumObstructedDistance, 9);
    this.obstructionDistanceSamples = clampInteger(obstructionDistanceSamples, 2, 32, 8);
    this.obstructionReleaseFrames = clampInteger(obstructionReleaseFrames, 1, 12, 3);
    this.recoveryClearance = finiteNonNegative(recoveryClearance, 36);
    this.recoveryMinimumAltitude = finiteNonNegative(recoveryMinimumAltitude, 72);
    this.smoothing = smoothing;
    this.position = { x: 0, y: 0, z: 0 };
    this.lookTarget = { x: 0, y: 0, z: 0 };
    this.initialized = false;
    this.obstructed = false;
    this.retainedObstructionDistance = null;
    this.obstructionClearFrames = 0;
    this.lastSampleHeight = () => Number.NEGATIVE_INFINITY;
    this.groundedSettleState = createGroundedCameraSettleState();
  }

  update({
    target,
    yaw = 0,
    bank = 0,
    speed = 0,
    grounded = false,
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
    this.groundedSettleState = stepGroundedCameraSettle(this.groundedSettleState, {
      grounded: grounded === true,
      dt: frame,
    });
    const groundedComposition = groundedCameraComposition(this.groundedSettleState);
    const settledSpeed = safeSpeed * groundedComposition.speedScale;
    const settledBank = safeBank * groundedComposition.bankScale;
    const forward = { x: Math.sin(safeYaw), z: Math.cos(safeYaw) };
    const right = { x: Math.cos(safeYaw), z: -Math.sin(safeYaw) };
    const speedStretch = clamp(settledSpeed / 80, 0, 1) * 8;
    const bankOffset = clamp(settledBank, -0.8, 0.8) * 4.5;
    const desiredDistance = Math.max(
      this.minimumObstructedDistance,
      this.distance + speedStretch + groundedComposition.distanceOffset,
    );
    const desiredY = anchor.y
      + this.height
      + groundedComposition.heightOffset
      + Math.min(settledSpeed * 0.035, 3.5);

    const obstruction = resolveTerrainObstructionDistance({
      anchor,
      forward,
      right,
      bankOffset,
      desiredDistance,
      desiredY,
      sampleHeight: activeSampleHeight,
      terrainClearance: this.terrainClearance,
      clearanceSamples: this.clearanceSamples,
      clearanceProbeSpacing: this.clearanceProbeSpacing,
      maximumClearanceSamples: this.maximumClearanceSamples,
      minimumDistance: this.minimumObstructedDistance,
      distanceSamples: this.obstructionDistanceSamples,
    });
    const retention = resolveTerrainObstructionRetention({
      obstruction,
      desiredDistance,
      retainedDistance: this.retainedObstructionDistance,
      clearFrames: this.obstructionClearFrames,
      releaseFrames: this.obstructionReleaseFrames,
    });
    const resolvedDistance = retention.distance;
    this.retainedObstructionDistance = retention.retainedDistance;
    this.obstructionClearFrames = retention.clearFrames;
    this.obstructed = obstruction.obstructed;

    const desired = {
      x: anchor.x - forward.x * resolvedDistance - right.x * bankOffset,
      y: desiredY,
      z: anchor.z - forward.z * resolvedDistance - right.z * bankOffset,
    };

    const minimumCameraHeight = Number.isFinite(obstruction.terrainHeight)
      ? obstruction.terrainHeight + this.terrainClearance
      : Number.NEGATIVE_INFINITY;
    if (desired.y < minimumCameraHeight) desired.y = minimumCameraHeight;

    const lookDistance = Math.max(
      0,
      this.lookAhead
        + groundedComposition.lookAheadOffset
        + clamp(settledSpeed * 0.11, 0, 8),
    );
    const desiredLook = {
      x: anchor.x + forward.x * lookDistance,
      y: anchor.y + 3.5 - clamp(settledBank * 1.2, -1, 1),
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
      this.retainedObstructionDistance = null;
      this.obstructionClearFrames = 0;
      this.groundedSettleState = clearGroundedCameraSettle();
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
    this.obstructed = false;
    this.retainedObstructionDistance = null;
    this.obstructionClearFrames = 0;
    this.groundedSettleState = clearGroundedCameraSettle();
    return this.update({ target, yaw, grounded: false, dt: 0, sampleHeight });
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

export function resolveTerrainObstructionRetention({
  obstruction,
  desiredDistance,
  retainedDistance = null,
  clearFrames = 0,
  releaseFrames = 3,
} = {}) {
  const ordinaryDistance = finitePositive(desiredDistance, 24);
  const releaseCount = clampInteger(releaseFrames, 1, 12, 3);
  const priorClearFrames = clampInteger(clearFrames, 0, releaseCount, 0);
  const priorRetained = Number.isFinite(Number(retainedDistance)) && Number(retainedDistance) > 0
    ? Math.min(ordinaryDistance, Number(retainedDistance))
    : null;
  const obstructionDistance = Number(obstruction?.distance);

  if (obstruction?.obstructed === true && Number.isFinite(obstructionDistance) && obstructionDistance > 0) {
    const distance = Math.min(ordinaryDistance, obstructionDistance);
    return Object.freeze({
      distance,
      retainedDistance: distance,
      clearFrames: 0,
      retained: true,
    });
  }

  if (priorRetained !== null && priorClearFrames < releaseCount - 1) {
    return Object.freeze({
      distance: priorRetained,
      retainedDistance: priorRetained,
      clearFrames: priorClearFrames + 1,
      retained: true,
    });
  }

  return Object.freeze({
    distance: ordinaryDistance,
    retainedDistance: null,
    clearFrames: 0,
    retained: false,
  });
}

export function resolveTerrainObstructionDistance({
  anchor,
  forward,
  right = { x: 1, z: 0 },
  bankOffset = 0,
  desiredDistance,
  desiredY,
  sampleHeight,
  terrainClearance = 5,
  clearanceSamples = 7,
  clearanceProbeSpacing = 0.5,
  maximumClearanceSamples = 129,
  minimumDistance = 9,
  distanceSamples = 8,
} = {}) {
  const fallbackDistance = finitePositive(desiredDistance, 24);
  const neutral = Object.freeze({
    distance: fallbackDistance,
    terrainHeight: Number.NEGATIVE_INFINITY,
    obstructed: false,
  });
  if (!finiteVector(anchor) || !finiteHorizontal(forward) || typeof sampleHeight !== "function" || !Number.isFinite(desiredY)) return neutral;

  const minimum = Math.min(fallbackDistance, finitePositive(minimumDistance, 9));
  const samples = clampInteger(distanceSamples, 2, 32, 8);
  const safeRight = finiteHorizontal(right) ? right : { x: 1, z: 0 };
  const safeBankOffset = Number.isFinite(bankOffset) ? bankOffset : 0;
  const clearance = finiteNonNegative(terrainClearance, 5);

  function probe(distance) {
    const candidate = {
      x: anchor.x - forward.x * distance - safeRight.x * safeBankOffset,
      y: desiredY,
      z: anchor.z - forward.z * distance - safeRight.z * safeBankOffset,
    };
    return maximumFiniteHeightAlongSegment(
      anchor,
      candidate,
      sampleHeight,
      clearanceSamples,
      { maximumSpacing: clearanceProbeSpacing, maximumSamples: maximumClearanceSamples },
    );
  }

  const fullTerrain = probe(fallbackDistance);
  if (!Number.isFinite(fullTerrain) || desiredY >= fullTerrain + clearance) {
    return Object.freeze({ distance: fallbackDistance, terrainHeight: fullTerrain, obstructed: false });
  }

  for (let index = 1; index < samples; index += 1) {
    const amount = index / (samples - 1);
    const distance = fallbackDistance + (minimum - fallbackDistance) * amount;
    const terrainHeight = probe(distance);
    if (!Number.isFinite(terrainHeight) || desiredY >= terrainHeight + clearance) {
      return Object.freeze({ distance, terrainHeight, obstructed: true });
    }
  }

  return Object.freeze({ distance: minimum, terrainHeight: probe(minimum), obstructed: true });
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
  const terrainHeight = normalizeTerrainHeight(sampleHeight(Number(target.x), Number(target.z)));
  return Number.isFinite(terrainHeight)
    ? Math.max(baseAltitude, floorAltitude, terrainHeight + clearance)
    : Math.max(baseAltitude, floorAltitude);
}

export function maximumFiniteHeightAlongSegment(
  start,
  end,
  sampleHeight,
  samples = 7,
  { maximumSpacing = Number.POSITIVE_INFINITY, maximumSamples = 513 } = {},
) {
  if (!finiteVector(start) || !finiteVector(end) || typeof sampleHeight !== "function") {
    return Number.NEGATIVE_INFINITY;
  }
  const minimumCount = clampInteger(samples, 2, 513, 7);
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const spacing = finitePositive(maximumSpacing, Number.POSITIVE_INFINITY);
  const adaptiveCount = Number.isFinite(spacing)
    ? Math.ceil(distance / spacing) + 1
    : minimumCount;
  const count = Math.min(
    clampInteger(maximumSamples, 2, 4097, 513),
    Math.max(minimumCount, adaptiveCount),
  );
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const amount = index / (count - 1);
    const x = start.x + (end.x - start.x) * amount;
    const z = start.z + (end.z - start.z) * amount;
    const height = normalizeTerrainHeight(sampleHeight(x, z));
    if (Number.isFinite(height)) maximum = Math.max(maximum, height);
  }
  return maximum;
}

export function normalizeTerrainHeight(sampled) {
  if (sampled === null || sampled === undefined) return Number.NEGATIVE_INFINITY;
  if (typeof sampled === "object") {
    const validity = typeof sampled.validity === "string" ? sampled.validity.toLowerCase() : "";
    const surface = typeof sampled.surface === "string" ? sampled.surface.toLowerCase() : "";
    if (surface === "water"
      || sampled.valid === false
      || sampled.outOfBounds === true
      || sampled.missing === true
      || ["missing", "non-finite", "out-of-bounds"].includes(validity)) {
      return Number.NEGATIVE_INFINITY;
    }
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

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? clamp(number, minimum, maximum) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
