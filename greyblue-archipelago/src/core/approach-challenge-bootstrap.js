import { buildArchipelago } from '../world/archipelago.js';
import { createApproachChallengeState, selectApproachCorridor, advanceApproachChallenge } from './approach-challenge.js';

const host = document.querySelector('#hud') ?? document.body;
const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let challenge = createApproachChallengeState();
let world = null;
let worldSeed = null;
let resetTimer = 0;
let invalidatedByRecovery = false;
let invalidatedByCancellation = false;
let disposed = false;

const panel = document.createElement('section');
panel.id = 'greyblue-approach-challenge';
panel.hidden = true;
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Approach challenge');
panel.innerHTML = `
  <div data-greyblue-approach-eyebrow>Clean approach</div>
  <strong data-greyblue-approach-title></strong>
  <div data-greyblue-approach-status></div>
`;

const announcement = document.createElement('div');
announcement.setAttribute('data-visually-hidden', '');
announcement.setAttribute('role', 'status');
announcement.setAttribute('aria-live', 'polite');
announcement.setAttribute('aria-atomic', 'true');
host.append(panel, announcement);

const titleNode = panel.querySelector('[data-greyblue-approach-title]');
const statusNode = panel.querySelector('[data-greyblue-approach-status]');

function getWorld(state) {
  const seed = Number.isInteger(state?.seed) ? state.seed : 1337;
  if (!world || seed !== worldSeed) {
    worldSeed = seed;
    world = buildArchipelago({ seed, count: 64, radius: 11000, minGap: 390 });
  }
  return world;
}

function nearestCandidate(state) {
  const position = state?.position;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  const discovered = Array.isArray(state.discovered) ? state.discovered : [];
  const candidates = [];
  for (const island of getWorld(state).islands) {
    const corridor = selectApproachCorridor({
      island,
      position,
      heading: state.flight?.yaw,
      discoveredIslandIds: discovered,
    });
    if (!corridor) continue;
    const distance = Math.hypot(position.x - corridor.entry.x, position.z - corridor.entry.z);
    candidates.push({ island, corridor, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.island.id.localeCompare(b.island.id) || a.corridor.id.localeCompare(b.corridor.id));
  return candidates[0] ?? null;
}

function landingZoneFor(island, corridor) {
  const zones = Array.isArray(island?.landingZones) ? island.landingZones : [];
  if (!zones.length) return null;
  const suffix = String(corridor?.id ?? '').split(':').pop();
  return zones.find((zone) => String(zone?.id ?? '').endsWith(`landing-${suffix}`)) ?? zones[0];
}

function phaseText(phase, islandName, reason) {
  if (phase === 'armed') return `Enter ${islandName}'s approach from the mist`;
  if (phase === 'in-corridor') return `Hold the corridor toward ${islandName}`;
  if (phase === 'final') return `Final approach to ${islandName}`;
  if (phase === 'succeeded') return `Clean approach · ${islandName}`;
  if (phase === 'broken') {
    const reasons = {
      recovery: 'approach broken by recovery',
      cancelled: 'approach cancelled',
      'too-low': 'approach broken · too low',
      'too-high': 'approach broken · too high',
      'wrong-way': 'approach broken · wrong heading',
      reversed: 'approach broken · reversed course',
      'left-corridor': 'approach broken · left corridor',
      'lost-momentum': 'approach broken · lost momentum',
    };
    return reasons[reason] ?? 'approach broken';
  }
  return '';
}

function scheduleReset() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    challenge = createApproachChallengeState();
    panel.hidden = true;
  }, 2600);
}

function render(state) {
  if (disposed || !state?.ready || state.paused) {
    panel.hidden = true;
    return;
  }

  const candidate = nearestCandidate(state);
  if (!candidate && challenge.phase === 'idle') {
    panel.hidden = true;
    return;
  }

  let island = candidate?.island ?? getWorld(state).islands.find((entry) => entry.id === challenge.islandId) ?? null;
  let corridor = candidate?.corridor ?? island?.approachCorridors?.find((entry) => entry.id === challenge.corridorId) ?? null;
  if (!island || !corridor) {
    challenge = createApproachChallengeState();
    panel.hidden = true;
    return;
  }

  const priorPhase = challenge.phase;
  const priorSequence = challenge.sequence;
  challenge = advanceApproachChallenge(challenge, {
    island,
    corridor,
    landingZone: landingZoneFor(island, corridor),
    position: state.position,
    altitude: state.position?.y,
    heading: state.flight?.yaw,
    forwardSpeed: state.flight?.speed,
    collision: state.collision,
    recovered: invalidatedByRecovery,
    cancelled: invalidatedByCancellation,
  });
  invalidatedByRecovery = false;
  invalidatedByCancellation = false;

  if (challenge.phase === 'idle') {
    panel.hidden = true;
    return;
  }

  const name = String(island.name || island.id).slice(0, 120);
  panel.hidden = false;
  panel.dataset.phase = challenge.phase;
  titleNode.textContent = phaseText(challenge.phase, name, challenge.reason);
  statusNode.textContent = challenge.phase === 'armed'
    ? 'Optional line · enter cleanly'
    : challenge.phase === 'in-corridor'
      ? 'Stay aligned and above the corridor floor'
      : challenge.phase === 'final'
        ? 'Carry the line to the landing shelf'
        : challenge.phase === 'succeeded'
          ? 'The route answered cleanly.'
          : 'Break away and try another approach.';

  if (challenge.sequence > priorSequence && (challenge.phase === 'succeeded' || challenge.phase === 'broken')) {
    const kind = challenge.phase === 'succeeded' ? 'succeeded' : 'broken';
    announcement.textContent = titleNode.textContent;
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:approach-challenge', {
      detail: Object.freeze({
        kind,
        islandId: challenge.islandId,
        corridorId: challenge.corridorId,
        reason: challenge.reason,
      }),
    }));
    scheduleReset();
  } else if (priorPhase !== challenge.phase && challenge.phase === 'final') {
    announcement.textContent = `Final approach to ${name}.`;
  }
}

function decoratedState() {
  const base = priorGet ? priorGet() : currentState;
  if (!base || typeof base !== 'object') return base;
  return { ...base, approachChallenge: challenge };
}

function onKeyDown(event) {
  if (event.repeat) return;
  if (event.code === 'KeyR') invalidatedByRecovery = true;
  if (event.code === 'KeyX') invalidatedByCancellation = true;
}

globalThis.addEventListener?.('keydown', onKeyDown);

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() {
      return decoratedState();
    },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      render(currentState);
    },
  });
}

render(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  if (resetTimer) clearTimeout(resetTimer);
  globalThis.removeEventListener?.('keydown', onKeyDown);
  panel.remove();
  announcement.remove();
}, { once: true });
