import { RidgeRideLine } from "./ridge-ride-line.js";

const INACTIVE = Object.freeze({ available: true, active: false, phase: "catch", completed: false });

export class LiveRidgeRide {
  constructor(options = {}) {
    this.model = new RidgeRideLine(options);
    this.lastCompleted = false;
  }

  update(sample = {}) {
    const state = this.model.update({
      ready: sample.ready === true,
      paused: sample.paused === true,
      airborne: sample.airborne === true,
      grounded: sample.grounded === true,
      landing: sample.landing === true,
      recovering: sample.recovering === true,
      restoring: sample.restoring === true,
      crossing: sample.crossing === true,
      ridgeLiftActive: sample.ridgeLiftActive === true,
      position: finitePosition(sample.position),
    });
    const completedNow = state.completed && !this.lastCompleted;
    this.lastCompleted = state.completed;
    return Object.freeze({ state, completedNow });
  }

  interrupt() {
    if (!this.model.completed) this.model.reset();
    return this.publicState();
  }

  publicState() {
    return this.model?.publicState?.() || INACTIVE;
  }
}

function finitePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return Object.freeze({ x: Number(position.x), z: Number(position.z) });
}

export function ridgeRideCompletionMessage(result) {
  return result?.completedNow === true ? "The ridge wind falls away behind you." : null;
}
