import { CrosswindRun } from "../flight/crosswind-run.js";

const MIN_STABLE_SPEED = 24;
const MAX_STABLE_STALL_FACTOR = 0.35;
const COMPLETION_MESSAGE = "You hold the crosswind until the air lets go.";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export class LiveCrosswindRun {
  constructor(options = {}) {
    this.run = new CrosswindRun(options);
  }

  update({ state = null, readback = null } = {}) {
    const flight = state?.flight;
    const collision = state?.collision;
    const speed = finite(flight?.speed);
    const stallFactor = finite(flight?.stallFactor);
    const stableFlight = state?.ready === true
      && state?.paused !== true
      && flight?.airborne === true
      && flight?.landingRequested !== true
      && speed !== null
      && speed >= MIN_STABLE_SPEED
      && stallFactor !== null
      && stallFactor <= MAX_STABLE_STALL_FACTOR
      && collision?.grounded !== true
      && collision?.requiresRecovery !== true;

    const traversal = this.run.update({
      ready: stableFlight,
      paused: state?.paused === true,
      airborne: flight?.airborne === true,
      landing: flight?.landingRequested === true,
      stalled: !stableFlight,
      grounded: collision?.grounded === true,
      recovering: collision?.requiresRecovery === true,
      crossing: state?.routeChoice?.reason === "active-crossing",
      currentDirection: readback?.active === true ? readback.direction : null,
      position: state?.position,
    });

    return Object.freeze({
      state: traversal,
      message: traversal.completed ? COMPLETION_MESSAGE : null,
    });
  }

  interrupt() {
    this.run.reset();
    return Object.freeze({ state: this.run.publicState(), message: null });
  }

  publicState() {
    return this.run.publicState();
  }
}

export const CROSSWIND_RUN_STABLE_SPEED = MIN_STABLE_SPEED;
