export class FlightController {
  constructor() {
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.airborne = false;
    this.landingRequested = false;
  }

  step(input, dt) {
    const frame = Math.min(Math.max(dt, 0), 0.05);
    const throttle = clamp(input.throttle || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    const climb = clamp(input.climb || 0, -1, 1);

    if (input.toggleFlight) {
      if (this.airborne) this.landingRequested = true;
      else {
        this.airborne = true;
        this.velocity.y = Math.max(this.velocity.y, 8);
      }
    }

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const targetSpeed = this.airborne ? 22 + 42 * Math.max(0, throttle) : 0;
    const acceleration = (targetSpeed - planarSpeed) * 2.2;
    const forward = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };

    this.velocity.x += forward.x * acceleration * frame;
    this.velocity.z += forward.z * acceleration * frame;
    this.yaw += steer * (0.55 + Math.min(planarSpeed / 70, 1)) * frame;
    this.bank += (steer * 0.65 - this.bank) * Math.min(1, frame * 5);

    if (this.airborne) {
      this.velocity.y += (climb * 18 - 4.5) * frame;
      if (this.landingRequested && this.velocity.y > -7) this.velocity.y -= 10 * frame;
    } else {
      this.velocity.y = 0;
    }

    return this.snapshot();
  }

  resolveGround(position, groundHeight) {
    if (position.y <= groundHeight) {
      position.y = groundHeight;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.landingRequested || Math.hypot(this.velocity.x, this.velocity.z) < 8) {
        this.airborne = false;
        this.landingRequested = false;
        this.velocity.x *= 0.35;
        this.velocity.z *= 0.35;
      }
    }
    return position;
  }

  snapshot() {
    return {
      velocity: { ...this.velocity },
      yaw: this.yaw,
      pitch: this.pitch,
      bank: this.bank,
      airborne: this.airborne,
      landingRequested: this.landingRequested,
    };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
