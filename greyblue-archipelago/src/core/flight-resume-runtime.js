import { normalizeFlightResume } from "./flight-resume.js";

export function applyFlightResume(controller, savedFlight) {
  if (!controller || typeof controller !== "object") return false;
  const resume = normalizeFlightResume(savedFlight);
  controller.yaw = resume.yaw;
  if (!controller.velocity || typeof controller.velocity !== "object") {
    controller.velocity = { x: 0, y: 0, z: 0 };
  }
  controller.velocity.x = resume.velocity.x;
  controller.velocity.y = resume.velocity.y;
  controller.velocity.z = resume.velocity.z;
  controller.airborne = resume.airborne;
  controller.landingRequested = resume.landingRequested;
  return true;
}

export function captureFlightResume(controller) {
  return normalizeFlightResume({
    yaw: controller?.yaw,
    velocity: controller?.velocity,
    airborne: controller?.airborne,
    landingRequested: controller?.landingRequested,
  });
}
