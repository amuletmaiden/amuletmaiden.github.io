import {
  deriveLiveRegionalAirCurrentReadback,
  regionalAirCurrentReadbackLabel,
} from "../core/regional-air-current-readback-live.js";
import { regionalAirCurrentForRegion } from "../world/regional-air-current-metadata.js";

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "__greyblueState");
const priorGet = typeof priorDescriptor?.get === "function" ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === "function" ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = "";

const INACTIVE = Object.freeze({ active: false, direction: null });

function ensureNode() {
  let node = document.querySelector("#greyblue-regional-air-current");
  if (node) return node;
  const hud = document.querySelector("#hud");
  if (!hud) return null;
  node = document.createElement("section");
  node.id = "greyblue-regional-air-current";
  node.hidden = true;
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-atomic", "true");
  Object.assign(node.style, {
    display: "grid",
    gap: "1px",
    marginTop: "7px",
    paddingTop: "6px",
    borderTop: "1px solid #a7c0c833",
  });
  hud.append(node);
  return node;
}

function render(view) {
  const publicView = Object.freeze({
    active: view?.active === true,
    direction: view?.active === true ? view.direction : null,
  });
  globalThis.__greyblueRegionalAirCurrentReadback = publicView;

  const node = ensureNode();
  if (!node) return;
  const key = `${publicView.active}|${publicView.direction || ""}`;
  if (key === lastKey) return;
  lastKey = key;
  node.hidden = !publicView.active;
  if (!publicView.active) {
    node.replaceChildren();
    return;
  }

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Air";
  eyebrow.style.cssText = "font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#b8ccd0";
  const line = document.createElement("strong");
  line.textContent = regionalAirCurrentReadbackLabel(publicView);
  line.style.cssText = "font-size:12px;font-weight:650;color:#d4e2e5";
  node.replaceChildren(eyebrow, line);
}

function apply(state) {
  const view = deriveLiveRegionalAirCurrentReadback({
    airCurrent: regionalAirCurrentForRegion(state?.currentRegion?.id),
    flight: state?.flight,
    collision: state?.collision,
    recovering: state?.collision?.requiresRecovery === true,
  });
  render(view);
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, "__greyblueState", {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      if (!disposed) apply(currentState);
    },
  });
}

render(INACTIVE);
if (currentState) apply(currentState);

globalThis.addEventListener?.("beforeunload", () => {
  disposed = true;
  document.querySelector("#greyblue-regional-air-current")?.remove();
  delete globalThis.__greyblueRegionalAirCurrentReadback;
}, { once: true });
