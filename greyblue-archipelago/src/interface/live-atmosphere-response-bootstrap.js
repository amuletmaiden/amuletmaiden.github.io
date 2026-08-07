import { createAtmosphereResponseModel } from "./live-atmosphere-response-model.js";

const root = document.documentElement;
const badge = document.querySelector("#greyblue-atmosphere-response");
const model = createAtmosphereResponseModel();
let disposed = false;
let lastState = globalThis.__greyblueState;

function render(state) {
  if (disposed || !state) return;
  const snapshot = model.update(state);
  if (!snapshot.changed) return;

  root.dataset.greyblueAtmosphere = snapshot.mode;
  root.style.setProperty("--greyblue-speed-pressure", snapshot.speedPressure.toFixed(3));
  root.style.setProperty("--greyblue-fog-pressure", snapshot.fogPressure.toFixed(3));
  root.style.setProperty("--greyblue-low-clearance", snapshot.lowClearance.toFixed(3));
  root.style.setProperty("--greyblue-high-altitude", snapshot.highAltitude.toFixed(3));

  if (badge) {
    badge.hidden = false;
    badge.dataset.mode = snapshot.mode;
    const modeLabel = snapshot.mode.replaceAll("-", " ");
    badge.textContent = `${snapshot.regionName} · ${modeLabel}`;
  }
}

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "__greyblueState");
if (!descriptor || descriptor.configurable) {
  Object.defineProperty(globalThis, "__greyblueState", {
    configurable: true,
    enumerable: true,
    get() {
      return lastState;
    },
    set(value) {
      lastState = value;
      render(value);
    },
  });
}

render(lastState);

addEventListener("pagehide", () => {
  disposed = true;
}, { once: true });
