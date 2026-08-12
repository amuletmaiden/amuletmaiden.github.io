const SETTLE_SECONDS = 0.52;
const REDUCED_SETTLE_SECONDS = 0.16;

const IDLE = Object.freeze({ active: false, phase: "complete" });

function finiteDt(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 0.1)) : 0;
}

export class TouchdownSettle {
  #armed = true;
  #remaining = 0;
  #duration = SETTLE_SECONDS;
  #phase = "complete";

  interrupt() {
    this.#remaining = 0;
    this.#phase = "complete";
    return IDLE;
  }

  update({ airborne = false, touchdown = false, interrupted = false, reducedMotion = false, dt = 0 } = {}) {
    if (interrupted) {
      this.#armed = false;
      return { state: this.interrupt(), started: false };
    }

    if (airborne) this.#armed = true;

    let started = false;
    if (touchdown && this.#armed) {
      this.#armed = false;
      this.#duration = reducedMotion ? REDUCED_SETTLE_SECONDS : SETTLE_SECONDS;
      this.#remaining = this.#duration;
      this.#phase = "touchdown";
      started = true;
    }

    if (this.#remaining <= 0) return { state: IDLE, started };

    this.#remaining = Math.max(0, this.#remaining - finiteDt(dt));
    if (this.#remaining <= 0) {
      this.#phase = "complete";
      return { state: IDLE, started };
    }

    if (!started) this.#phase = "settle";
    return {
      state: Object.freeze({ active: true, phase: this.#phase }),
      started,
    };
  }
}

export function touchdownSettleMessage(result) {
  return result?.started === true ? "Touchdown. The dragon settles onto the shelf." : null;
}
