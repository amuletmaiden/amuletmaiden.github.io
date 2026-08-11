import { deriveBankTurnCarry } from "./bank-turn-carry.js";
import { deriveBankedTurnVerticalLoad } from "./banked-turn-load.js";
import { deriveGlideCoastTarget } from "./glide-coast.js";
import { deriveLandingVerticalTarget } from "./landing-flare.js";
import {
  advanceTakeoffLiftElapsed,
  deriveTakeoffLift,
  TAKEOFF_LIFT_DURATION,
} from "./takeoff-lift.js";
import { deriveVerticalEnergySpeedBias } from "./vertical-energy-coupling.js";

export class FlightController {
  constructor() {
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.airborne = false;
    this.landingRequested = false;
    this.stallFactor = 0;
    this.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  }

  step(input, dt) {
    const frame = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
    const throttle = clamp(input.throttle || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    const climb = clamp(input.climb || 0, -1, 1);

    if (input.toggleFlight) {
      if (this.airborne) {
        this.landingRequested = !this.landingRequested;
        this.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
      } else {
        this.airborne = true;
        this.landingRequested = false;
        this.takeoffLiftElapsed = 0;
      }
    }

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const stallPressure = this.airborne
      ? clamp((11 - planarSpeed) / 11, 0, 1) * (1 - Math.max(0, throttle))
      : 0;
    const takeoffLiftActive = this.takeoffLiftElapsed < TAKEOFF_LIFT_DURATION;
    const bankTurnCarry = deriveBankTurnCarry({
      airborne: this.airborne,
      landingRequested: this.landingRequested,
      takeoffActive: takeoffLiftActive,
      stallPressure,
      steer,
      bank: this.bank,
      planarSpeed,
    });
    const turnAuthority = 0.48 + Math.min(planarSpeed / 65, 1) * 0.58;
    this.yaw += (steer + bankTurnCarry) * turnAuthority * frame;

    const forward = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    let targetSpeed = 0;
    if (this.airborne) {
      targetSpeed = throttle >= 0 ? 20 + 42 * throttle : 20 + 12 * throttle;
      if (this.landingRequested) {
        targetSpeed = Math.min(targetSpeed, 14);
      } else {
        if (!takeoffLiftActive) {
          targetSpeed += deriveVerticalEnergySpeedBias({
            airborne: true,
            verticalVelocity: this.velocity.y,
            planarSpeed,
          });
        }
        targetSpeed = deriveGlideCoastTarget({
          airborne: true,
          landingRequested: false,
          takeoffActive: takeoffLiftActive,
          stallPressure,
          throttle,
          planarSpeed,
          ordinaryTargetSpeed: targetSpeed,
        });
        if (stallPressure > 0) {
          targetSpeed = Math.max(targetSpeed, 14 + 10 * stallPressure);
        }
      }
    }

    const planarResponse = 1 - Math.exp(-(this.airborne ? 2.35 : 5.5) * frame);
    this.velocity.x += (forward.x * targetSpeed - this.velocity.x) * planarResponse;
    this.velocity.z += (forward.z * targetSpeed - this.velocity.z) * planarResponse;

    const updatedPlanarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stallFactor = this.airborne
      ? clamp((11 - updatedPlanarSpeed) / 11, 0, 1) * (1 - Math.max(0, throttle))
      : 0;

    if (this.airborne) {
      const bankedTurnLoad = deriveBankedTurnVerticalLoad({
        airborne: this.airborne,
        bank: this.bank,
        planarSpeed: updatedPlanarSpeed,
      });
      const takeoffLift = deriveTakeoffLift({
        active: !this.landingRequested,
        elapsed: this.takeoffLiftElapsed,
      });
      let targetVertical = climb * 17 - 1.6 - this.stallFactor * 4.5 + bankedTurnLoad;
      if (takeoffLift > 0) {
        targetVertical = Math.max(targetVertical + takeoffLift, takeoffLift * 0.55);
      }
      targetVertical = deriveLandingVerticalTarget({
        airborne: this.airborne,
        landingRequested: this.landingRequested,
        takeoffActive: takeoffLift > 0,
        climb,
        ordinaryTargetVertical: targetVertical,
      });
      const verticalResponse = 1 - Math.exp(-2.8 * frame);
      this.velocity.y += (targetVertical - this.velocity.y) * verticalResponse;
      this.velocity.y = clamp(this.velocity.y, -18, 24);
      this.takeoffLiftElapsed = advanceTakeoffLiftElapsed({
        active: takeoffLift > 0,
        elapsed: this.takeoffLiftElapsed,
        dt: frame,
      });
    } else {
      this.velocity.y = 0;
      this.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
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
        this.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
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
      this.takeoffLiftElapsed,
    ];
    if (values.every(Number.isFinite)) return;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.airborne = true;
    this.landingRequested = false;
    this.stallFactor = 1;
    this.takeoffLiftElapsed = TAKEOFF_LIFT_DURATION;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
