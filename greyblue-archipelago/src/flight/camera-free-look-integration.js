import {
  cameraFreeLookTelemetry,
  resetCameraFreeLook,
  stepCameraFreeLook,
} from "./camera-free-look.js";

const LOOK_TARGET_PITCH_DISTANCE = 18;

export class FreeLookChaseCamera {
  constructor(chaseCamera) {
    this.chaseCamera = chaseCamera;
    this.lookState = resetCameraFreeLook();
  }

  update({
    target,
    yaw = 0,
    bank = 0,
    speed = 0,
    grounded = false,
    dt = 1 / 60,
    sampleHeight,
    lookX = 0,
    lookY = 0,
    interrupted = false,
    reducedMotion = false,
  } = {}) {
    this.lookState = stepCameraFreeLook(this.lookState, {
      lookX,
      lookY,
      dt,
      interrupted,
      reducedMotion,
    });

    const safeYaw = Number.isFinite(Number(yaw)) ? Number(yaw) : 0;
    const cameraState = this.chaseCamera.update({
      target,
      yaw: safeYaw + this.lookState.yawOffset,
      bank,
      speed,
      grounded,
      reducedMotion,
      dt,
      sampleHeight,
    });

    const lookTarget = { ...cameraState.lookTarget };
    if (Number.isFinite(lookTarget.y)) {
      lookTarget.y += Math.tan(this.lookState.pitchOffset) * LOOK_TARGET_PITCH_DISTANCE;
    }

    return Object.freeze({
      ...cameraState,
      position: Object.freeze({ ...cameraState.position }),
      lookTarget: Object.freeze(lookTarget),
      freeLook: cameraFreeLookTelemetry(this.lookState),
    });
  }

  snapTo(target, yaw = 0, sampleHeight) {
    this.lookState = resetCameraFreeLook();
    const state = this.chaseCamera.snapTo(target, yaw, sampleHeight);
    return Object.freeze({
      ...state,
      position: Object.freeze({ ...state.position }),
      lookTarget: Object.freeze({ ...state.lookTarget }),
      freeLook: cameraFreeLookTelemetry(this.lookState),
    });
  }

  resetLook() {
    this.lookState = resetCameraFreeLook();
  }

  snapshot() {
    const state = this.chaseCamera.snapshot();
    return Object.freeze({
      ...state,
      position: Object.freeze({ ...state.position }),
      lookTarget: Object.freeze({ ...state.lookTarget }),
      freeLook: cameraFreeLookTelemetry(this.lookState),
    });
  }

  get distance() {
    return this.chaseCamera.distance;
  }

  set distance(value) {
    this.chaseCamera.distance = value;
  }
}
