import { makeRoostEvent, recoverLatestRoost, stepRoostDwell } from './roost-anchor.js';

const MAX_EVENTS = 2048;

function cleanId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function eventKey(event) {
  if (!event || event.kind !== 'roost-established') return null;
  const islandId = cleanId(event.islandId);
  const zoneId = cleanId(event.landingZoneId || event.id);
  return islandId && zoneId ? `${islandId}:${zoneId}` : null;
}

export function appendRoostEvent(exploration = null, event = null) {
  const source = Array.isArray(exploration?.events) ? exploration.events : [];
  const key = eventKey(event);
  if (!key) return Object.freeze({ version: 1, events: Object.freeze(source.slice(0, MAX_EVENTS)) });

  const next = [];
  for (const candidate of source.slice(0, MAX_EVENTS - 1)) {
    if (eventKey(candidate) === key) continue;
    next.push(candidate);
  }
  next.push(event);
  next.sort((left, right) => (Number(left?.occurredAt) || 0) - (Number(right?.occurredAt) || 0));
  return Object.freeze({ version: 1, events: Object.freeze(next) });
}

export function stepEarnedRoost({ dwell = null, frame = null, exploration = null, occurredAt = 0, dwellSeconds } = {}) {
  const nextDwell = stepRoostDwell(dwell, frame || {}, dwellSeconds);
  const alreadyEstablished = cleanId(dwell?.islandId) === nextDwell.islandId
    && cleanId(dwell?.zoneId) === nextDwell.zoneId
    && dwell?.established === true;
  const event = nextDwell.established && !alreadyEstablished ? makeRoostEvent(nextDwell, occurredAt) : null;
  return Object.freeze({
    dwell: nextDwell,
    event,
    exploration: event ? appendRoostEvent(exploration, event) : exploration,
    newlyEstablished: Boolean(event),
  });
}

export function planRoostRecovery({ world = null, exploration = null, discoveredIslandIds = [], fallback = null } = {}) {
  const roost = recoverLatestRoost({ world, exploration, discoveredIslandIds });
  if (roost) return Object.freeze({ source: 'earned-roost', ...roost });
  const x = Number(fallback?.x); const y = Number(fallback?.y); const z = Number(fallback?.z);
  const position = [x, y, z].every(Number.isFinite) ? Object.freeze({ x, y, z }) : null;
  return Object.freeze({ source: 'fallback', islandId: null, zoneId: null, position, heading: 0 });
}
