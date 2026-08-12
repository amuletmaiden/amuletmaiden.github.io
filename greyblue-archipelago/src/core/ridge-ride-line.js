const DEFAULTS = Object.freeze({
  armSamples: 3,
  minimumSpacing: 8,
  completionTravel: 180,
  gapSamples: 2,
  maximumStep: 120,
});

export class RidgeRideLine {
  constructor(options = {}) {
    this.limits = Object.freeze({ ...DEFAULTS, ...sanitizeOptions(options) });
    this.reset();
    this.completed = false;
  }

  reset() {
    this.active = false;
    this.phase = "catch";
    this.armCount = 0;
    this.gapCount = 0;
    this.travel = 0;
    this.lastPosition = null;
  }

  update(sample = {}) {
    if (this.completed) return this.publicState();
    if (mustReset(sample)) {
      this.reset();
      return this.publicState();
    }

    const position = finitePosition(sample.position);
    if (!position) {
      this.reset();
      return this.publicState();
    }

    const step = this.lastPosition ? planarDistance(this.lastPosition, position) : 0;
    if (step > this.limits.maximumStep) {
      this.reset();
      this.lastPosition = position;
      return this.publicState();
    }

    const liftActive = sample.ridgeLiftActive === true;
    if (!this.active) {
      if (liftActive) {
        if (!this.lastPosition || step >= this.limits.minimumSpacing) this.armCount += 1;
        if (this.armCount >= this.limits.armSamples) {
          this.active = true;
          this.phase = "ride";
          this.travel = 0;
          this.gapCount = 0;
        }
      } else {
        this.armCount = 0;
      }
      this.lastPosition = position;
      return this.publicState();
    }

    if (liftActive) {
      this.gapCount = 0;
      if (step >= this.limits.minimumSpacing) this.travel += step;
      this.phase = "ride";
    } else {
      this.gapCount += 1;
      if (this.travel >= this.limits.completionTravel) {
        this.phase = "release";
        if (this.gapCount > this.limits.gapSamples) {
          this.completed = true;
          this.active = false;
        }
      } else if (this.gapCount > this.limits.gapSamples) {
        this.reset();
      }
    }

    this.lastPosition = position;
    return this.publicState();
  }

  publicState() {
    return Object.freeze({
      available: !this.completed,
      active: this.active,
      phase: this.completed ? "release" : this.phase,
      completed: this.completed,
    });
  }
}

function mustReset(sample) {
  return sample.ready === false
    || sample.paused === true
    || sample.airborne === false
    || sample.grounded === true
    || sample.landing === true
    || sample.recovering === true
    || sample.restoring === true
    || sample.crossing === true;
}

function finitePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return { x: Number(position.x), z: Number(position.z) };
}

function planarDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function sanitizeOptions(options) {
  const clean = {};
  for (const key of Object.keys(DEFAULTS)) {
    const value = Number(options[key]);
    if (Number.isFinite(value) && value > 0) clean[key] = value;
  }
  clean.armSamples = Math.max(1, Math.round(clean.armSamples ?? DEFAULTS.armSamples));
  clean.gapSamples = Math.max(0, Math.round(clean.gapSamples ?? DEFAULTS.gapSamples));
  return clean;
}

export const RIDGE_RIDE_DEFAULTS = DEFAULTS;
