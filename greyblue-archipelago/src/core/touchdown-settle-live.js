import { TouchdownSettle, touchdownSettleMessage } from "./touchdown-settle.js";

const IDLE = Object.freeze({ active: false, phase: "complete" });

function truthfulTouchdown(collision) {
  return collision?.grounded === true
    && collision?.reason === "touchdown"
    && collision?.requiresRecovery === false;
}

export class LiveTouchdownSettle {
  #model = new TouchdownSettle();
  #state = IDLE;

  publicState() {
    return this.#state;
  }

  interrupt() {
    this.#model.update({ interrupted: true });
    this.#state = IDLE;
    return this.#state;
  }

  update({ collision = null, airborne = false, recovering = false, reducedMotion = false, dt = 0 } = {}) {
    const interrupted = recovering === true || collision?.requiresRecovery === true;
    const result = this.#model.update({
      airborne: airborne === true && collision?.grounded !== true,
      touchdown: truthfulTouchdown(collision),
      interrupted,
      reducedMotion: reducedMotion === true,
      dt,
    });
    this.#state = result.state;
    return Object.freeze({
      state: this.#state,
      message: interrupted ? null : touchdownSettleMessage(result),
    });
  }
}
