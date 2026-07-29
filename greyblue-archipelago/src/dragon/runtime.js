export class DragonRuntime {
  constructor(model) {
    this.model = model;
    this.actions = new Map();
    this.state = "grounded-idle";
    this.telemetry = { state: this.state, clip: null, missing: [] };
  }

  bindClips(clips = []) {
    for (const clip of clips) this.actions.set(clip.name.toLowerCase(), clip);
    return [...this.actions.keys()];
  }

  choose(state) {
    const aliases = {
      "grounded-idle": ["idle", "ground", "rest"],
      takeoff: ["takeoff", "launch"],
      flight: ["fly", "flight", "flap"],
      glide: ["glide", "soar"],
      turn: ["turn", "bank"],
      landing: ["land", "landing"],
      recovery: ["recover", "idle"],
    };

    const clip = (aliases[state] || [state])
      .flatMap((alias) => [...this.actions.keys()].filter((name) => name.includes(alias)))[0] || null;

    this.state = state;
    this.telemetry = {
      state,
      clip,
      missing: clip ? this.telemetry.missing : [...new Set([...this.telemetry.missing, state])],
    };
    return clip;
  }

  updateFromFlight(flight) {
    let next = "grounded-idle";
    if (flight.airborne && flight.landingRequested) next = "landing";
    else if (flight.airborne && Math.abs(flight.bank) > 0.35) next = "turn";
    else if (flight.airborne && Math.hypot(flight.velocity.x, flight.velocity.z) > 42) next = "glide";
    else if (flight.airborne) next = "flight";
    return this.choose(next);
  }
}
