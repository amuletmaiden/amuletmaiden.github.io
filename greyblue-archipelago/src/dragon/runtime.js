export class DragonRuntime {
  constructor(model, mixer = null) {
    this.model = model;
    this.mixer = mixer;
    this.clips = new Map();
    this.actions = new Map();
    this.roles = new Map();
    this.currentAction = null;
    this.currentClip = null;
    this.state = "grounded-idle";
    this.stateAge = 0;
    this.pendingState = null;
    this.pendingAge = 0;
    this.lastAirborne = false;
    this.telemetry = {
      state: this.state,
      clip: null,
      fallback: false,
      available: [],
      missing: [],
      stateAge: 0,
      pendingState: null,
    };
  }

  bindClips(clips = []) {
    this.clips.clear();
    this.actions.clear();
    this.roles.clear();
    for (const clip of clips) {
      const key = clip.name.toLowerCase();
      this.clips.set(key, clip);
      if (this.mixer) this.actions.set(key, this.mixer.clipAction(clip));
    }
    const keys = [...this.clips.keys()];
    const idle = firstMatch(keys, ["idle", "rest", "sentinel", "ground"]);
    const flight = firstMatch(keys, ["fly", "flight", "flap", "wing", "readiness"]);
    const mappings = {
      "grounded-idle": firstMatch(keys, ["idle", "ground", "rest", "sentinel"]) || idle,
      takeoff: firstMatch(keys, ["takeoff", "launch"]) || flight || idle,
      flight: firstMatch(keys, ["fly", "flight", "flap"]) || flight || idle,
      glide: firstMatch(keys, ["glide", "soar"]) || flight || idle,
      turn: firstMatch(keys, ["turn", "bank"]) || flight || idle,
      landing: firstMatch(keys, ["land", "landing"]) || flight || idle,
      recovery: firstMatch(keys, ["recover"]) || idle || flight,
    };
    for (const [role, key] of Object.entries(mappings)) if (key) this.roles.set(role, key);
    this.telemetry.available = keys;
    this.choose("grounded-idle", { speed: 0 }, true);
    return keys;
  }

  choose(state, flight = {}, force = false) {
    const key = this.roles.get(state) || null;
    const clip = key ? this.clips.get(key) : null;
    const action = key ? this.actions.get(key) : null;
    const exact = Boolean(key && roleMatchesName(state, key));
    const speed = Number.isFinite(flight.speed)
      ? flight.speed
      : Math.hypot(flight.velocity?.x || 0, flight.velocity?.z || 0);
    const rate = playbackRate(state, speed);
    const stateChanged = state !== this.state;
    if (action && action !== this.currentAction) {
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight?.(1);
      action.setEffectiveTimeScale?.(rate);
      action.fadeIn?.(crossfadeDuration(state));
      action.play?.();
      this.currentAction?.fadeOut?.(crossfadeDuration(state));
      this.currentAction = action;
      this.currentClip = key;
    } else if (action) {
      action.setEffectiveTimeScale?.(rate);
    }
    if (stateChanged || force) this.stateAge = 0;
    this.state = state;
    this.pendingState = null;
    this.pendingAge = 0;
    const missing = key
      ? this.telemetry.missing.filter((value) => value !== state)
      : [...new Set([...this.telemetry.missing, state])];
    this.telemetry = {
      state,
      clip: clip?.name || null,
      fallback: Boolean(key && !exact),
      playbackRate: rate,
      available: [...this.clips.keys()],
      missing,
      stateAge: this.stateAge,
      pendingState: null,
    };
    return clip?.name || null;
  }

  updateFromFlight(flight = {}) {
    const desired = desiredState(flight, this.state, this.lastAirborne);
    this.lastAirborne = Boolean(flight.airborne);
    if (desired === this.state) {
      this.pendingState = null;
      this.pendingAge = 0;
      return this.choose(this.state, flight);
    }
    if (this.stateAge < minimumHold(this.state)) {
      this.pendingState = desired;
      this.pendingAge = 0;
      this.telemetry.pendingState = desired;
      return this.choose(this.state, flight);
    }
    if (this.pendingState !== desired) {
      this.pendingState = desired;
      this.pendingAge = 0;
      this.telemetry.pendingState = desired;
      return this.choose(this.state, flight);
    }
    if (this.pendingAge < transitionDebounce(desired)) {
      this.telemetry.pendingState = desired;
      return this.choose(this.state, flight);
    }
    return this.choose(desired, flight);
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.stateAge += dt;
    if (this.pendingState) this.pendingAge += dt;
    this.telemetry.stateAge = this.stateAge;
    this.telemetry.pendingState = this.pendingState;
    this.mixer?.update(dt);
  }
}

function desiredState(flight, currentState, lastAirborne) {
  if (!flight.airborne) return "grounded-idle";
  if (flight.landingRequested) return "landing";
  if (flight.mode === "recovery") return "recovery";
  if (!lastAirborne || flight.mode === "takeoff") return "takeoff";
  const bank = Math.abs(flight.bank || 0);
  if (bank > 0.42 || (currentState === "turn" && bank > 0.24)) return "turn";
  const speed = Number.isFinite(flight.speed) ? flight.speed : 0;
  if (flight.mode === "glide" || speed > 44 || (currentState === "glide" && speed > 38)) return "glide";
  return "flight";
}

function minimumHold(state) {
  if (state === "takeoff") return 0.65;
  if (state === "landing") return 0.45;
  if (state === "recovery") return 0.7;
  return 0.08;
}

function transitionDebounce(state) {
  return state === "turn" || state === "glide" ? 0.12 : 0.06;
}

function firstMatch(keys, aliases) {
  for (const alias of aliases) {
    const match = keys.find((name) => name.includes(alias));
    if (match) return match;
  }
  return null;
}

function roleMatchesName(role, name) {
  const aliases = {
    "grounded-idle": ["idle", "ground", "rest", "sentinel"],
    takeoff: ["takeoff", "launch"],
    flight: ["fly", "flight", "flap"],
    glide: ["glide", "soar"],
    turn: ["turn", "bank"],
    landing: ["land", "landing"],
    recovery: ["recover"],
  };
  return (aliases[role] || [role]).some((alias) => name.includes(alias));
}

function playbackRate(state, speed) {
  if (state === "grounded-idle") return 0.9;
  if (state === "takeoff") return 1.35;
  if (state === "glide") return 0.72;
  if (state === "turn") return 1.18;
  if (state === "landing") return 0.84;
  if (state === "recovery") return 1.05;
  return clamp(0.78 + speed / 72, 0.78, 1.55);
}

function crossfadeDuration(state) {
  return state === "takeoff" || state === "landing" ? 0.18 : 0.3;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
