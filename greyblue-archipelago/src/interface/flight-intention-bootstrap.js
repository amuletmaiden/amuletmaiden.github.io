import { deriveFlightIntention } from './flight-intention.js';
import {
  deriveFlightIntentionStrongSurface,
  resolveFlightIntentionDensity,
  nextFlightIntentionAnnouncement,
} from './flight-intention-view.js';

let disposed = false;
let lastVisualKey = '';
let lastAnnouncedKey = '';

const hud = document.querySelector('#hud');
const section = document.createElement('section');
section.id = 'greyblue-flight-intention';
section.hidden = true;
section.setAttribute('aria-label', 'Current flight intention');
section.innerHTML = '<span data-greyblue-flight-intention-text></span><span data-greyblue-flight-intention-status role="status" aria-live="polite" aria-atomic="true" data-visually-hidden></span>';
hud?.append(section);

const textNode = section.querySelector('[data-greyblue-flight-intention-text]');
const statusNode = section.querySelector('[data-greyblue-flight-intention-status]');

const style = document.createElement('style');
style.id = 'greyblue-flight-intention-style';
style.textContent = `
  #greyblue-flight-intention { margin:.3rem 0; opacity:.86; font-size:.92em; letter-spacing:.01em; }
  #hud[data-greyblue-hud-density="focused"] #greyblue-flight-intention { opacity:.78; }
  #hud[data-greyblue-hud-density="expanded"] #greyblue-flight-intention { opacity:1; }
  @media (prefers-reduced-motion: no-preference) {
    #greyblue-flight-intention { transition:opacity 120ms linear; }
  }
  @media (prefers-contrast: more) {
    #greyblue-flight-intention { opacity:1; font-weight:600; }
  }
`;
document.head?.append(style);

function visible(selector) {
  const node = document.querySelector(selector);
  return Boolean(node && node.isConnected && !node.hidden);
}

function strongSurfaceActive() {
  return deriveFlightIntentionStrongSurface({
    errorText: document.querySelector('#error')?.textContent || '',
    safety: globalThis.__greyblueHudFocus?.safety === true,
    landing: visible('#greyblue-landing-approach'),
    landmark: visible('#greyblue-landmark-encounter'),
    crossing: visible('#greyblue-crossing-objective'),
    guidance: visible('#greyblue-destination-guidance'),
    approach: visible('#greyblue-approach-challenge'),
  });
}

function states() {
  return {
    fullColumnWeather: globalThis.__greyblueFullColumnWeatherRun,
    ridgeToCloudAscent: globalThis.__greyblueRidgeToCloudAscent,
    highAirLandfall: globalThis.__greyblueHighAirLandfall,
    highAirCrossing: globalThis.__greyblueHighAirCrossing,
    mysteryListeningPass: globalThis.__greyblueMysteryListeningPass,
    regionalMysterySearchFlight: globalThis.__greyblueRegionalMysterySearchFlight,
    surveyToLandingSortie: globalThis.__greyblueSurveyToLandingSortie,
    discoveredIslandSurvey: globalThis.__greyblueDiscoveredIslandSurvey,
    cloudbreakRun: globalThis.__greyblueCloudbreakRun,
    deepMistRun: globalThis.__greyblueDeepMistRun,
    islandHopRun: globalThis.__greyblueIslandHopRun,
    touchAndGoLaunch: globalThis.__greyblueTouchAndGoLaunch,
  };
}

function render() {
  if (disposed || !hud) return;
  const intention = deriveFlightIntention({ strongSurface: strongSurfaceActive(), states: states() });
  const density = resolveFlightIntentionDensity(
    document.documentElement.dataset.greyblueHudDensity,
    hud.dataset.greyblueHudDensity,
  );
  hud.dataset.greyblueHudDensity = density;

  const visualKey = `${intention.visible}|${intention.kind}|${intention.phase}|${intention.text}|${density}`;
  if (visualKey !== lastVisualKey) {
    lastVisualKey = visualKey;
    section.hidden = !intention.visible;
    section.dataset.kind = intention.kind;
    section.dataset.phase = intention.phase;
    if (textNode) textNode.textContent = intention.visible ? intention.text : '';
  }

  const announcement = nextFlightIntentionAnnouncement(intention, lastAnnouncedKey);
  if (announcement.changed) {
    lastAnnouncedKey = announcement.key;
    if (statusNode) statusNode.textContent = announcement.text;
  }

  globalThis.__greyblueFlightIntention = intention;
}

const refreshEvents = Object.freeze([
  'greyblue:deep-mist-run', 'greyblue:cloudbreak-run', 'greyblue:full-column-weather-run',
  'greyblue:ridge-to-cloud-ascent', 'greyblue:high-air-crossing', 'greyblue:high-air-landfall',
  'greyblue:mystery-listening-pass', 'greyblue:regional-mystery-search-flight',
  'greyblue:survey-to-landing-sortie', 'greyblue:discovered-island-survey',
  'greyblue:island-hop-run', 'greyblue:touch-and-go-launch', 'greyblue:crossing-cancelled',
  'greyblue:landmark-flight-encounter', 'keydown',
]);
function refreshSoon() { queueMicrotask(render); }
for (const eventName of refreshEvents) globalThis.addEventListener?.(eventName, refreshSoon);

const timer = setInterval(render, 240);
render();

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  clearInterval(timer);
  for (const eventName of refreshEvents) globalThis.removeEventListener?.(eventName, refreshSoon);
  section.remove();
  style.remove();
  delete globalThis.__greyblueFlightIntention;
}, { once: true });
