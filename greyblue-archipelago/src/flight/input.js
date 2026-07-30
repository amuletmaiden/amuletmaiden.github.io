const DEFAULT_BINDINGS = Object.freeze({
  throttleForward: ["KeyW", "ArrowUp"],
  throttleBack: ["KeyS", "ArrowDown"],
  steerLeft: ["KeyA", "ArrowLeft"],
  steerRight: ["KeyD", "ArrowRight"],
  climb: ["Space"],
  descend: ["ShiftLeft", "ShiftRight"],
  toggleFlight: ["KeyE"],
  recover: ["KeyR"],
  pause: ["Escape", "KeyP"],
});

const GAMEPAD_ACTIONS = Object.freeze(["toggleFlight", "recover", "pause"]);

export class FlightInput {
  constructor({ bindings = DEFAULT_BINDINGS, deadzone = 0.14 } = {}) {
    this.bindings = bindings;
    this.deadzone = deadzone;
    this.keys = new Set();
    this.edges = new Set();
    this.gamepad = null;
    this.gamepadButtons = { toggleFlight: false, recover: false, pause: false };
    this.gamepadEdges = new Set();
    this.enabled = true;
  }

  keyDown(code, repeat = false) {
    if (!this.enabled || typeof code !== "string") return;
    if (!this.keys.has(code) && !repeat) this.edges.add(code);
    this.keys.add(code);
  }

  keyUp(code) {
    this.keys.delete(code);
  }

  setGamepad(gamepad) {
    const normalized = normalizeGamepad(gamepad, this.deadzone);
    const nextButtons = {
      toggleFlight: Boolean(normalized?.toggleFlight),
      recover: Boolean(normalized?.recover),
      pause: Boolean(normalized?.pause),
    };
    for (const action of GAMEPAD_ACTIONS) {
      if (nextButtons[action] && !this.gamepadButtons[action]) {
        this.gamepadEdges.add(action);
      }
    }
    this.gamepadButtons = nextButtons;
    this.gamepad = normalized;
  }

  clear() {
    this.keys.clear();
    this.edges.clear();
    this.gamepad = null;
    this.gamepadButtons = { toggleFlight: false, recover: false, pause: false };
    this.gamepadEdges.clear();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  sample() {
    if (!this.enabled) return neutralSample();
    const keyboard = {
      throttle: axis(this.keys, this.bindings.throttleForward, this.bindings.throttleBack),
      steer: axis(this.keys, this.bindings.steerLeft, this.bindings.steerRight),
      climb: axis(this.keys, this.bindings.climb, this.bindings.descend),
    };
    const pad = this.gamepad || neutralSample();
    return {
      throttle: dominantAxis(keyboard.throttle, pad.throttle),
      steer: dominantAxis(keyboard.steer, pad.steer),
      climb: dominantAxis(keyboard.climb, pad.climb),
      toggleFlight: this.#consumeEdge(this.bindings.toggleFlight)
        || this.gamepadEdges.delete("toggleFlight"),
      recover: this.#consumeEdge(this.bindings.recover)
        || this.gamepadEdges.delete("recover"),
      pause: this.#consumeEdge(this.bindings.pause)
        || this.gamepadEdges.delete("pause"),
      source: pad.active ? (keyboardActive(keyboard) ? "mixed" : "gamepad") : "keyboard",
    };
  }

  #consumeEdge(codes = []) {
    for (const code of codes) {
      if (this.edges.delete(code)) return true;
    }
    return false;
  }
}

export function normalizeGamepad(gamepad, deadzone = 0.14) {
  if (!gamepad) return null;
  const axes = Array.from(gamepad.axes || [], finiteOrZero);
  const buttons = Array.from(gamepad.buttons || [], buttonValue);
  const steer = deadzoneAxis(axes[0] || 0, deadzone);
  const climb = deadzoneAxis(-(axes[1] || 0), deadzone);
  const rightTrigger = buttons[7] || 0;
  const leftTrigger = buttons[6] || 0;
  const throttle = clamp(rightTrigger - leftTrigger || -(axes[3] || 0), -1, 1);
  const active = [steer, climb, throttle].some((value) => Math.abs(value) > 0.001)
    || buttons.some((value) => value > 0.5);
  return {
    throttle,
    steer,
    climb,
    toggleFlight: (buttons[0] || 0) > 0.5,
    recover: (buttons[3] || 0) > 0.5,
    pause: (buttons[9] || 0) > 0.5,
    active,
  };
}

function axis(keys, positive = [], negative = []) {
  return (positive.some((code) => keys.has(code)) ? 1 : 0)
    - (negative.some((code) => keys.has(code)) ? 1 : 0);
}

function keyboardActive(sample) {
  return Math.abs(sample.throttle) + Math.abs(sample.steer) + Math.abs(sample.climb) > 0;
}

function dominantAxis(keyboard, gamepad) {
  return clamp(Math.abs(keyboard) >= Math.abs(gamepad || 0) ? keyboard : gamepad || 0, -1, 1);
}

function deadzoneAxis(value, deadzone) {
  const finite = finiteOrZero(value);
  const magnitude = Math.abs(finite);
  if (magnitude <= deadzone) return 0;
  const normalized = (magnitude - deadzone) / Math.max(1 - deadzone, Number.EPSILON);
  return Math.sign(finite) * clamp(normalized, 0, 1);
}

function buttonValue(button) {
  if (typeof button === "number") return clamp(finiteOrZero(button), 0, 1);
  return clamp(finiteOrZero(button?.value ?? (button?.pressed ? 1 : 0)), 0, 1);
}

function finiteOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function neutralSample() {
  return {
    throttle: 0,
    steer: 0,
    climb: 0,
    toggleFlight: false,
    recover: false,
    pause: false,
    active: false,
    source: "none",
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export { DEFAULT_BINDINGS };
