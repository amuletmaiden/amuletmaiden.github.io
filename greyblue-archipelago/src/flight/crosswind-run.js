const PHASES = new Set(["catch", "hold", "release"]);

function finitePoint(position) {
  const x = Number(position?.x);
  const z = Number(position?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function stable(input) {
  return input?.ready === true && input?.paused !== true && input?.airborne === true &&
    input?.landing !== true && input?.stalled !== true && input?.grounded !== true &&
    input?.recovering !== true && input?.crossing !== true;
}

export class CrosswindRun {
  constructor({ requiredTravel = 420, maxStep = 150, minStep = 4 } = {}) {
    this.requiredTravel = Math.max(80, Number(requiredTravel) || 420);
    this.maxStep = Math.max(30, Number(maxStep) || 150);
    this.minStep = Math.max(1, Number(minStep) || 4);
    this.reset();
  }

  reset() {
    this.side = null;
    this.phase = "catch";
    this.travel = 0;
    this.last = null;
    this.completed = false;
  }

  update(input = {}) {
    if (this.completed) {
      this.completed = false;
      this.phase = "catch";
    }
    if (!stable(input)) {
      this.reset();
      return this.publicState();
    }
    const point = finitePoint(input.position);
    if (!point) {
      this.reset();
      return this.publicState();
    }
    const direction = input.currentDirection;
    const side = direction === "cross-left" || direction === "cross-right" ? direction : null;

    if (!this.side) {
      if (!side) return this.publicState();
      this.side = side;
      this.last = point;
      this.phase = "catch";
      return this.publicState();
    }

    if (side && side !== this.side) {
      this.reset();
      this.side = side;
      this.last = point;
      return this.publicState();
    }

    if (!side) {
      if (this.travel >= this.requiredTravel) {
        this.phase = "release";
        this.completed = true;
        this.side = null;
        this.last = null;
        return this.publicState();
      }
      this.reset();
      return this.publicState();
    }

    const dx = point.x - this.last.x;
    const dz = point.z - this.last.z;
    const step = Math.hypot(dx, dz);
    this.last = point;
    if (!Number.isFinite(step) || step > this.maxStep) {
      this.reset();
      return this.publicState();
    }
    if (step >= this.minStep) this.travel += step;
    if (this.travel >= this.minStep * 3) this.phase = "hold";
    return this.publicState();
  }

  publicState() {
    return Object.freeze({
      available: true,
      active: this.side !== null,
      phase: PHASES.has(this.phase) ? this.phase : "catch",
      completed: this.completed === true,
    });
  }
}
