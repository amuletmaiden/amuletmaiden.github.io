import {
  createOptionalFramePressureState,
  optionalPresentationBudget,
  publicOptionalFramePressureState,
  stepOptionalFramePressure,
} from './optional-frame-pressure.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let modelState = createOptionalFramePressureState();
let lastPublishAt = null;

function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function publish() {
  globalThis.__greyblueOptionalFramePressure = publicOptionalFramePressureState(modelState);
  globalThis.__greyblueOptionalPresentationBudget = optionalPresentationBudget(modelState, {
    reducedMotion: reducedMotion(),
  });
}

function consume(state) {
  const now = performance.now();
  if (!state?.ready || state?.paused === true) {
    lastPublishAt = null;
    publish();
    return;
  }

  if (Number.isFinite(lastPublishAt)) {
    modelState = stepOptionalFramePressure(modelState, { deltaMs: now - lastPublishAt });
  }
  lastPublishAt = now;
  publish();
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      consume(currentState);
    },
  });
}

publish();
consume(currentState);
