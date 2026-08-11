import { createOptionalSurfaceReadiness } from "./optional-surface-readiness.js";

const OPTIONAL_SURFACES = [
  ["guidance", () => import("../interface/live-guidance-bootstrap.js")],
  ["journal", () => import("./exploration-journal-bootstrap.js")],
  ["flight-instruments", () => import("../interface/live-flight-instruments-bootstrap.js")],
  ["frame-pressure", () => import("./optional-frame-pressure-bootstrap.js")],
  ["landing-approach", () => import("../interface/live-landing-approach-bootstrap.js")],
  ["landmark-encounter", () => import("./landmark-encounter-bootstrap.js")],
  ["landmark-flight-encounter", () => import("./landmark-flight-encounter-bootstrap.js")],
  ["crossing-objective", () => import("./crossing-objective-bootstrap.js")],
  ["listening-pulse", () => import("./listening-pulse-bootstrap.js")],
  ["approach-challenge", () => import("./approach-challenge-bootstrap.js")],
  ["soundscape", () => import("./soundscape-bootstrap.js")],
  ["vertical-weather-vapor", () => import("./vertical-weather-vapor-bootstrap.js")],
  ["familiar-mist", () => import("./familiar-mist-bootstrap.js")],
  ["regional-omens", () => import("./regional-omen-bootstrap.js")],
  ["regional-mystery-thread", () => import("./regional-mystery-thread-bootstrap.js")],
  ["regional-mystery-search-flight", () => import("./regional-mystery-search-flight-bootstrap.js")],
  ["mystery-listening-pass", () => import("./mystery-listening-pass-bootstrap.js")],
  ["expedition", () => import("./expedition-bootstrap.js")],
  ["familiar-crossing-signature", () => import("./familiar-crossing-signature-bootstrap.js")],
  ["known-crossing-destination-atmosphere", () => import("./known-crossing-destination-atmosphere-bootstrap.js")],
  ["known-crossing-destination-atmosphere-presentation", () => import("./known-crossing-destination-atmosphere-presentation-bootstrap.js")],
  ["roost-rest", () => import("./roost-rest-bootstrap.js")],
  ["known-landmark-revisit", () => import("./known-landmark-revisit-bootstrap.js")],
  ["known-landmark-traversal-circuit", () => import("./known-landmark-traversal-circuit-bootstrap.js")],
  ["regional-flight-memory", () => import("./regional-flight-memory-bootstrap.js")],
  ["regional-aerial-echo", () => import("./regional-aerial-echo-bootstrap.js")],
  ["known-landmark-mist-cues", () => import("./known-landmark-mist-cues-bootstrap.js")],
  ["undiscovered-island-mist-hints", () => import("./undiscovered-island-mist-hint-bootstrap.js")],
  ["mist-thread-arrival", () => import("./mist-thread-arrival-bootstrap.js")],
  ["discovered-island-survey", () => import("./discovered-island-survey-bootstrap.js")],
  ["survey-to-landing-sortie", () => import("./survey-to-landing-sortie-bootstrap.js")],
  ["discovered-landing-shelf-cues", () => import("./discovered-landing-shelf-cues-bootstrap.js")],
  ["precision-touchdown", () => import("./precision-touchdown-challenge-bootstrap.js")],
  ["precision-touchdown-feedback", () => import("./precision-touchdown-feedback-bootstrap.js")],
  ["touch-and-go-launch", () => import("./touch-and-go-launch-bootstrap.js")],
  ["island-hop-run", () => import("./island-hop-run-bootstrap.js")],
  ["cloudbreak-run", () => import("./cloudbreak-run-bootstrap.js")],
  ["high-air-crossing", () => import("./high-air-crossing-bootstrap.js")],
  ["high-air-landfall", () => import("./high-air-landfall-bootstrap.js")],
  ["deep-mist-run", () => import("./deep-mist-run-bootstrap.js")],
  ["full-column-weather-run", () => import("./full-column-weather-run-bootstrap.js")],
  ["mastered-approach-air-lanes", () => import("./mastered-approach-air-lanes-bootstrap.js")],
  ["low-flight-wake", () => import("./low-flight-wake-bootstrap.js")],
  ["low-flight-surface-run", () => import("./low-flight-surface-run-bootstrap.js")],
  ["bank-mist-arcs", () => import("./bank-mist-arcs-bootstrap.js")],
  ["dive-pull-climb-mastery", () => import("./dive-pull-climb-mastery-bootstrap.js")],
  ["linked-bank-reversal-mastery", () => import("./linked-bank-reversal-mastery-bootstrap.js")],
  ["terrain-ridge-run", () => import("./terrain-ridge-run-bootstrap.js")],
  ["ridge-to-cloud-ascent", () => import("./ridge-to-cloud-ascent-bootstrap.js")],
  ["contextual-hud", () => import("../interface/contextual-hud-bootstrap.js")],
  ["flight-intention", () => import("../interface/flight-intention-bootstrap.js")],
  ["flight-debrief", () => import("./flight-debrief-bootstrap.js")],
].map(([id, load]) => ({ id, load }));

const readiness = createOptionalSurfaceReadiness(OPTIONAL_SURFACES);
let statusNode = null;

function ensureStatusNode() {
  if (statusNode?.isConnected) return statusNode;
  const hud = document.querySelector("#hud");
  if (!hud) return null;
  statusNode = document.createElement("div");
  statusNode.id = "greyblue-optional-status";
  statusNode.setAttribute("role", "status");
  statusNode.setAttribute("aria-live", "polite");
  statusNode.setAttribute("aria-atomic", "true");
  statusNode.hidden = true;
  hud.append(statusNode);
  return statusNode;
}

function publish(snapshot) {
  globalThis.__greyblueOptionalBoot = snapshot;
  document.documentElement.dataset.greyblueOptionalBoot = snapshot.degraded ? "degraded" : snapshot.ready ? "ready" : "starting";

  const node = ensureStatusNode();
  if (!node) return;
  if (!snapshot.degraded) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = `Optional systems unavailable: ${snapshot.failedOptionalSurfaceIds.join(", ")}`;
}

publish(readiness.snapshot());
await readiness.loadAll(publish);

await import("./exploration-persistence-bootstrap.js");
await import("../app.js");
