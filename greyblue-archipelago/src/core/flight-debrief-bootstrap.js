import { createFlightDebriefSession } from './flight-debrief.js';
import {
  FLIGHT_DEBRIEF_COMPLETION_EVENTS,
  FLIGHT_DEBRIEF_LANDING_EVENTS,
  flightDebriefCategoryForEvent,
  flightDebriefLandingForEvent,
  flightDebriefRuntimePolicy,
} from './flight-debrief-integration.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let wasAirborne = false;
const session = createFlightDebriefSession();

function runtime() {
  return flightDebriefRuntimePolicy(currentState);
}

function onState(state = currentState) {
  if (disposed) return;
  const policy = flightDebriefRuntimePolicy(state);
  if (policy.restoring || policy.recovering) {
    session.reset();
    wasAirborne = false;
    return;
  }
  if (policy.airborne && !wasAirborne) session.beginAirborne();
  wasAirborne = policy.airborne;
}

function onCompletion(event) {
  if (disposed) return;
  const policy = runtime();
  if (!policy.airborne) return;
  const category = flightDebriefCategoryForEvent(event?.type, event?.detail);
  if (category) session.record(category);
}

function onLanding(event) {
  if (disposed) return;
  const policy = runtime();
  if (!flightDebriefLandingForEvent(event?.type, event?.detail, policy)) return;
  const result = session.resolve({
    safe: true,
    restoring: policy.restoring,
    recovering: policy.recovering,
  });
  if (!result.completed) return;
  globalThis.dispatchEvent?.(new CustomEvent('greyblue:flight-debrief', {
    detail: Object.freeze({ completed: true, text: result.text, lines: result.lines }),
  }));
}

for (const type of FLIGHT_DEBRIEF_COMPLETION_EVENTS) globalThis.addEventListener?.(type, onCompletion);
for (const type of FLIGHT_DEBRIEF_LANDING_EVENTS) globalThis.addEventListener?.(type, onLanding);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      onState(currentState);
    },
  });
}

onState(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  session.reset();
  for (const type of FLIGHT_DEBRIEF_COMPLETION_EVENTS) globalThis.removeEventListener?.(type, onCompletion);
  for (const type of FLIGHT_DEBRIEF_LANDING_EVENTS) globalThis.removeEventListener?.(type, onLanding);
}, { once: true });
