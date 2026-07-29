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
    this.telemetry = {
      state: this.state,
      clip: null,
      fallback: false,
      available: [],
      missing: [],
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

    for (const [role, key] of Object.entries(mappings)) {
      if (key) this.roles.set(role, key);
    }

    this.telemetry.available = keys;
    this.choose("grounded-idle", { speed: 0 });
    return keys;
  }

  choose(state, flight = {}) {
    const key = this.roles.get(state) || null;
    const clip = key ? this.clips.get(key) : null;
    const action = key ? this.actions.get(key) : null;
    const exact = Boolean(key && roleMatchesName(state, key));
    const speed = Number.isFinite(flight.speed)
      ? flight.speed
      : Math.hypot(flight.velocity?.x || 0, flight.velocity?.z || 0);
    const rate = playbackRate(state, speed);

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

    this.state = state;
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
    };
    return clip?.name || null;
  }

  updateFromFlight(flight) {
    let next = "grounded-idle";
    if (flight.airborne && flight.landingRequested) next = "landing";
    else if (flight.airborne && flight.mode === "recovery") next = "recovery";
    else if (flight.airborne && Math.abs(flight.bank) > 0.35) next = "turn";
    else if (flight.airborne && (flight.mode === "glide" || flight.speed > 42)) next = "glide";
    else if (flight.airborne) next = "flight";
    return this.choose(next, flight);
  }

  update(dt) {
    if (Number.isFinite(dt) && dt > 0) this.mixer?.update(dt);
  }
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
