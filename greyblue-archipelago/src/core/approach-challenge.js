const TAU = Math.PI * 2;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boundedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function angleDelta(a, b) {
  const delta = ((finite(a) - finite(b) + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Math.abs(delta);
}

function point(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, y: finite(value.y), z: value.z };
}

function normalizedCorridor(corridor, landingZone) {
  const id = boundedId(corridor?.id);
  const entry = point(corridor?.entry);
  const touchdown = point(corridor?.touchdown);
  if (!id || !entry || !touchdown) return null;
  const dx = touchdown.x - entry.x;
  const dz = touchdown.z - entry.z;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 40) return null;
  const width = clamp(finite(corridor?.width, 110), 40, 260);
  return Object.freeze({
    id,
    entry,
    touchdown,
    dx,
    dz,
    length,
    width,
    minimumAltitude: clamp(finite(corridor?.minimumAltitude, 45), 0, 3000),
    maximumAltitude: clamp(Math.max(entry.y + 220, finite(corridor?.minimumAltitude, 45) + 120), 80, 4000),
    heading: finite(corridor?.heading, Math.atan2(dx, dz)),
    landingRadius: clamp(finite(landingZone?.radius, width * 0.55), 30, 180),
  });
}

function geometry(corridor, position) {
  const px = position.x - corridor.entry.x;
  const pz = position.z - corridor.entry.z;
  const progress = (px * corridor.dx + pz * corridor.dz) / (corridor.length * corridor.length);
  const lateral = Math.abs(px * corridor.dz - pz * corridor.dx) / corridor.length;
  const entryDistance = Math.hypot(position.x - corridor.entry.x, position.z - corridor.entry.z);
  const touchdownDistance = Math.hypot(position.x - corridor.touchdown.x, position.z - corridor.touchdown.z);
  return { progress, lateral, entryDistance, touchdownDistance };
}

export function createApproachChallengeState() {
  return Object.freeze({
    phase: 'idle',
    islandId: null,
    corridorId: null,
    progress: 0,
    reason: null,
    sequence: 0,
  });
}

export function selectApproachCorridor({ island, position, heading, discoveredIslandIds } = {}) {
  const islandId = boundedId(island?.id);
  const discovered = new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds.map(boundedId).filter(Boolean) : []);
  if (!islandId || !discovered.has(islandId) || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  const corridors = Array.isArray(island?.approachCorridors) ? island.approachCorridors : [];
  const zones = Array.isArray(island?.landingZones) ? island.landingZones : [];
  const candidates = [];
  for (let index = 0; index < corridors.length; index += 1) {
    const corridor = normalizedCorridor(corridors[index], zones[index] ?? zones[0]);
    if (!corridor) continue;
    const g = geometry(corridor, position);
    const headingError = angleDelta(heading, corridor.heading);
    if (g.progress > 0.14 || g.entryDistance > Math.max(240, corridor.width * 2.2)) continue;
    candidates.push({ corridor, entryDistance: g.entryDistance, headingError });
  }
  candidates.sort((a, b) => a.entryDistance - b.entryDistance || a.headingError - b.headingError || a.corridor.id.localeCompare(b.corridor.id));
  return candidates[0]?.corridor ?? null;
}

export function advanceApproachChallenge(previous, sample = {}) {
  const prior = previous && typeof previous === 'object' ? previous : createApproachChallengeState();
  const islandId = boundedId(sample?.island?.id);
  const corridor = normalizedCorridor(sample?.corridor, sample?.landingZone);
  const position = point(sample?.position);
  const heading = finite(sample?.heading);
  const speed = Math.max(0, finite(sample?.forwardSpeed));
  const invalidated = Boolean(sample?.recovered || sample?.cancelled || sample?.collision?.requiresRecovery);

  const broken = (reason) => Object.freeze({
    phase: 'broken',
    islandId: prior.islandId ?? islandId,
    corridorId: prior.corridorId ?? corridor?.id ?? null,
    progress: clamp(finite(prior.progress), 0, 1),
    reason,
    sequence: finite(prior.sequence) + 1,
  });

  if (invalidated && prior.phase !== 'idle' && prior.phase !== 'succeeded') return broken(sample?.cancelled ? 'cancelled' : 'recovery');
  if (!islandId || !corridor || !position) return createApproachChallengeState();

  const g = geometry(corridor, position);
  const headingError = angleDelta(heading, corridor.heading);
  const altitude = finite(sample?.altitude, position.y);
  const altitudeOk = altitude >= corridor.minimumAltitude && altitude <= corridor.maximumAltitude;
  const alignedWide = headingError <= Math.PI * 0.31;
  const alignedTight = headingError <= Math.PI * 0.20;
  const moving = speed >= 8;
  const inside = g.lateral <= corridor.width * 0.52;
  const finalInside = g.lateral <= corridor.width * 0.68;
  const sameChallenge = prior.islandId === islandId && prior.corridorId === corridor.id;

  if (prior.phase === 'idle' || prior.phase === 'broken' || !sameChallenge) {
    const armed = g.progress >= -0.34 && g.progress <= 0.05
      && g.entryDistance <= Math.max(220, corridor.width * 1.9)
      && altitudeOk && alignedWide && moving;
    if (!armed) return createApproachChallengeState();
    return Object.freeze({ phase: 'armed', islandId, corridorId: corridor.id, progress: 0, reason: null, sequence: finite(prior.sequence) });
  }

  if (prior.phase === 'succeeded') return prior;
  if (!altitudeOk) return broken(altitude < corridor.minimumAltitude ? 'too-low' : 'too-high');
  if (!moving) return broken('lost-momentum');
  if (!alignedWide) return broken('wrong-way');
  if (g.progress < finite(prior.progress) - 0.09) return broken('reversed');
  if (g.progress >= 0.02 && !inside && g.progress < 0.78) return broken('left-corridor');

  const progress = clamp(g.progress, 0, 1);
  if (g.progress >= 0.88 && g.progress <= 1.18 && finalInside && alignedTight && g.touchdownDistance <= corridor.landingRadius * 1.35) {
    return Object.freeze({ phase: 'succeeded', islandId, corridorId: corridor.id, progress: 1, reason: null, sequence: finite(prior.sequence) + 1 });
  }
  if (g.progress >= 0.72) {
    if (!finalInside || !alignedTight) return broken(!finalInside ? 'left-corridor' : 'wrong-way');
    return Object.freeze({ phase: 'final', islandId, corridorId: corridor.id, progress, reason: null, sequence: finite(prior.sequence) });
  }
  if (g.progress >= 0.02) {
    return Object.freeze({ phase: 'in-corridor', islandId, corridorId: corridor.id, progress, reason: null, sequence: finite(prior.sequence) });
  }
  return Object.freeze({ phase: 'armed', islandId, corridorId: corridor.id, progress: 0, reason: null, sequence: finite(prior.sequence) });
}
