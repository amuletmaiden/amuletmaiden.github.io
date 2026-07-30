export class FlightController {
  constructor() {
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.airborne = false;
    this.landingRequested = false;
    this.stallFactor = 0;
  }

  step(input, dt) {
    const frame = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
    const throttle = clamp(input.throttle || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    const climb = clamp(input.climb || 0, -1, 1);

    if (input.toggleFlight) {
      if (this.airborne) {
        this.landingRequested = !this.landingRequested;
      } else {
        this.airborne = true;
        this.landingRequested = false;
        this.velocity.y = Math.max(this.velocity.y, 8);
      }
    }

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const turnAuthority = 0.48 + Math.min(planarSpeed / 65, 1) * 0.58;
    this.yaw += steer * turnAuthority * frame;

    const forward = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    let targetSpeed = 0;
    if (this.airborne) {
      targetSpeed = throttle >= 0 ? 20 + 42 * throttle : 20 + 12 * throttle;
      if (this.landingRequested) targetSpeed = Math.min(targetSpeed, 14);
    }

    // Converge the entire planar velocity vector toward the desired heading.
    // The old scalar acceleration along the current heading could add energy
    // during hard turns and grow velocity without bound.
    const planarResponse = 1 - Math.exp(-(this.airborne ? 2.35 : 5.5) * frame);
    this.velocity.x += (forward.x * targetSpeed - this.velocity.x) * planarResponse;
    this.velocity.z += (forward.z * targetSpeed - this.velocity.z) * planarResponse;

    const updatedPlanarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stallFactor = this.airborne
      ? clamp((11 - updatedPlanarSpeed) / 11, 0, 1) * (1 - Math.max(0, throttle))
      : 0;

    if (this.airborne) {
      let targetVertical = climb * 17 - 1.6 - this.stallFactor * 4.5;
      // A landing request is an intentional approach, not a barely faster glide.
      // Fourteen units per second still reads as controlled, while allowing a
      // high-altitude player to reach the ground in a useful amount of time.
      if (this.landingRequested) targetVertical = Math.min(targetVertical, -14);
      const verticalResponse = 1 - Math.exp(-2.8 * frame);
      this.velocity.y += (targetVertical - this.velocity.y) * verticalResponse;
      this.velocity.y = clamp(this.velocity.y, -18, 24);
    } else {
      this.velocity.y = 0;
    }

    const bankTarget = steer * (0.45 + Math.min(updatedPlanarSpeed / 70, 1) * 0.32);
    const poseResponse = 1 - Math.exp(-5 * frame);
    this.bank += (bankTarget - this.bank) * poseResponse;
    const pitchTarget = this.airborne
      ? clamp(climb * 0.34 - this.stallFactor * 0.12 - (this.landingRequested ? 0.12 : 0), -0.42, 0.42)
      : 0;
    this.pitch += (pitchTarget - this.pitch) * poseResponse;

    this.#repairNonFiniteState();
    return this.snapshot();
  }

  resolveGround(position, groundHeight) {
    if (!Number.isFinite(groundHeight)) return position;
    if (position.y <= groundHeight) {
      position.y = groundHeight;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.landingRequested || Math.hypot(this.velocity.x, this.velocity.z) < 8) {
        this.airborne = false;
        this.landingRequested = false;
        this.velocity.x *= 0.35;
        this.velocity.z *= 0.35;
        this.stallFactor = 0;
      }
    }
    return position;
  }

  snapshot() {
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    return {
      velocity: { ...this.velocity },
      speed: planarSpeed,
      yaw: this.yaw,
      pitch: this.pitch,
      bank: this.bank,
      airborne: this.airborne,
      landingRequested: this.landingRequested,
      stallFactor: this.stallFactor,
      mode: !this.airborne
        ? "grounded"
        : this.landingRequested
          ? "landing"
          : planarSpeed > 44
            ? "glide"
            : this.stallFactor > 0.35
              ? "recovery"
              : "powered-flight",
    };
  }

  #repairNonFiniteState() {
    const values = [
      this.velocity.x,
      this.velocity.y,
      this.velocity.z,
      this.yaw,
      this.pitch,
      this.bank,
    ];
    if (values.every(Number.isFinite)) return;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.airborne = true;
    this.landingRequested = false;
    this.stallFactor = 1;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
