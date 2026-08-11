import { getKnownVoyageStreamingCandidates } from './known-voyage-streaming-channel.js';

const DEFAULT_CAP = 10;

function cleanId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampCap(value) {
  if (!Number.isFinite(value)) return DEFAULT_CAP;
  return Math.max(0, Math.min(64, Math.floor(value)));
}

function islandClass(island) {
  return island?.landmark === true ? 'landmark' : 'ordinary';
}

function sanitizeIsland(island) {
  const id = cleanId(island?.id);
  const x = Number(island?.x);
  const z = Number(island?.z);
  const scale = Number(island?.scale);
  const height = Number(island?.height);
  if (!id || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return Object.freeze({ id, x, z, scale, height, landmark: island?.landmark === true });
}

function transitionTelemetry(activeEntries) {
  let transitioning = 0;
  let maxOpacity = 0;
  for (const entry of activeEntries) {
    const transition = entry?.resource?.userData?.streamTransition;
    if (!transition) continue;
    if (transition.transitioning === true) transitioning += 1;
    const opacity = Number(transition.opacity);
    if (Number.isFinite(opacity)) maxOpacity = Math.max(maxOpacity, Math.min(1, Math.max(0, opacity)));
  }
  return Object.freeze({ transitioning, maxOpacity });
}

export function createStreamedIslandPool({ cap = DEFAULT_CAP, create, reset, dispose } = {}) {
  if (typeof create !== 'function' || typeof reset !== 'function' || typeof dispose !== 'function') {
    throw new TypeError('streamed island pool requires create/reset/dispose adapters');
  }

  const limit = clampCap(cap);
  const idle = { ordinary: [], landmark: [] };
  const active = new Map();
  const totals = { created: 0, reused: 0, pooled: 0, disposed: 0, rejected: 0 };

  function acquire(rawIsland) {
    const island = sanitizeIsland(rawIsland);
    if (!island) {
      totals.rejected += 1;
      return null;
    }
    if (active.has(island.id)) return active.get(island.id).resource;

    const kind = islandClass(island);
    let resource = idle[kind].pop() ?? null;
    if (resource) totals.reused += 1;
    else {
      resource = create(kind, island);
      if (!resource) {
        totals.rejected += 1;
        return null;
      }
      totals.created += 1;
    }

    reset(resource, island, kind);
    active.set(island.id, { resource, kind });
    return resource;
  }

  function release(id) {
    const key = cleanId(id);
    const entry = active.get(key);
    if (!entry) return false;
    active.delete(key);
    const pooledCount = idle.ordinary.length + idle.landmark.length;
    if (pooledCount < limit) {
      reset(entry.resource, null, entry.kind);
      idle[entry.kind].push(entry.resource);
      totals.pooled += 1;
    } else {
      dispose(entry.resource);
      totals.disposed += 1;
    }
    return true;
  }

  function sync(islands = []) {
    const baseline = Array.isArray(islands) ? islands : [];
    const continuity = getKnownVoyageStreamingCandidates();
    const candidates = continuity.length ? [...baseline, ...continuity] : baseline;
    const wanted = new Set();
    const ordered = [];
    for (const rawIsland of candidates) {
      const island = sanitizeIsland(rawIsland);
      if (!island || wanted.has(island.id)) continue;
      wanted.add(island.id);
      ordered.push(island);
    }

    for (const id of [...active.keys()]) {
      if (!wanted.has(id)) release(id);
    }
    for (const island of ordered) acquire(island);
    return ordered.map((island) => active.get(island.id)?.resource).filter(Boolean);
  }

  function teardown() {
    for (const entry of active.values()) {
      dispose(entry.resource);
      totals.disposed += 1;
    }
    active.clear();
    for (const kind of ['ordinary', 'landmark']) {
      while (idle[kind].length) {
        dispose(idle[kind].pop());
        totals.disposed += 1;
      }
    }
  }

  function telemetry() {
    return Object.freeze({
      active: active.size,
      pooled: idle.ordinary.length + idle.landmark.length,
      created: totals.created,
      reused: totals.reused,
      disposed: totals.disposed,
      rejected: totals.rejected,
      cap: limit,
      transition: transitionTelemetry(active.values()),
    });
  }

  return Object.freeze({ acquire, release, sync, teardown, telemetry });
}

export const streamedIslandPresentationInternals = Object.freeze({ sanitizeIsland, islandClass, clampCap, transitionTelemetry });
