const PHASES = Object.freeze(['entry', 'middle', 'final']);
const GATE_RADIUS = 72;
const LANE_ENVELOPE = 190;
const MIN_SPEED = 12;
const REVERSAL_TOLERANCE = 0.08;

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
}

function distance3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function insideGate(position, gate) {
  return distance3D(position, gate) <= GATE_RADIUS;
}

function laneGeometry(lane) {
  const trace = Array.isArray(lane?.trace) ? lane.trace.map(point).filter(Boolean) : [];
  const corridorId = cleanId(lane?.corridorId);
  if (!corridorId || trace.length !== 5) return null;
  const start = trace[0];
  const end = trace[trace.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length2 = dx * dx + dy * dy + dz * dz;
  if (!Number.isFinite(length2) || length2 < 1600) return null;
  return Object.freeze({ corridorId, trace: Object.freeze(trace), start, end, dx, dy, dz, length2 });
}

function progressAlong(position, geometry) {
  const px = position.x - geometry.start.x;
  const py = position.y - geometry.start.y;
  const pz = position.z - geometry.start.z;
  return Math.max(0, Math.min(1, (px * geometry.dx + py * geometry.dy + pz * geometry.dz) / geometry.length2));
}

function distanceToLane(position, geometry) {
  const t = progressAlong(position, geometry);
  const x = geometry.start.x + geometry.dx * t;
  const y = geometry.start.y + geometry.dy * t;
  const z = geometry.start.z + geometry.dz * t;
  return Math.hypot(position.x - x, position.y - y, position.z - z);
}

function phaseForGate(index) {
  if (index <= 1) return 'entry';
  if (index >= 4) return 'final';
  return 'middle';
}

function idle(previousPosition = null, completed = false) {
  return Object.freeze({
    status: completed ? 'completed' : 'idle',
    corridorId: null,
    nextGateIndex: 0,
    previousPosition,
    lastProgress: 0,
    completed,
  });
}

function inactivePublic(completed = false) {
  return Object.freeze({ available: false, active: false, phase: null, completed });
}

export function createMasteredAirLaneCleanRunState() {
  return idle(null, false);
}

export function stepMasteredAirLaneCleanRun({
  state,
  lanes,
  position,
  speed,
  airborne = true,
  recoveryActive = false,
  crossingActive = false,
  restorePublishing = false,
} = {}) {
  const dragon = point(position);
  const prior = state && typeof state === 'object' ? state : createMasteredAirLaneCleanRunState();
  const previousPosition = point(prior.previousPosition);
  const completed = prior.completed === true || prior.status === 'completed';
  const candidates = Array.isArray(lanes) ? lanes.map(laneGeometry).filter(Boolean) : [];

  if (!dragon || airborne !== true || recoveryActive || crossingActive || restorePublishing) {
    return idle(dragon, completed);
  }

  if (completed) return idle(dragon, true);

  const activeCorridorId = cleanId(prior.corridorId);
  if (prior.status === 'active' && activeCorridorId) {
    const geometry = candidates.find((candidate) => candidate.corridorId === activeCorridorId);
    if (!geometry) return idle(dragon, false);

    const progress = progressAlong(dragon, geometry);
    const lastProgress = finite(prior.lastProgress) ?? 0;
    if (distanceToLane(dragon, geometry) > LANE_ENVELOPE || progress + REVERSAL_TOLERANCE < lastProgress) {
      return idle(dragon, false);
    }

    let nextGateIndex = Number.isInteger(prior.nextGateIndex) ? prior.nextGateIndex : 1;
    nextGateIndex = Math.max(1, Math.min(4, nextGateIndex));
    const expectedGate = geometry.trace[nextGateIndex];
    if (insideGate(dragon, expectedGate)) {
      if (nextGateIndex === geometry.trace.length - 1) {
        return Object.freeze({
          status: 'completed',
          corridorId: null,
          nextGateIndex: geometry.trace.length,
          previousPosition: dragon,
          lastProgress: 1,
          completed: true,
        });
      }
      nextGateIndex += 1;
    }

    return Object.freeze({
      status: 'active',
      corridorId: geometry.corridorId,
      nextGateIndex,
      previousPosition: dragon,
      lastProgress: Math.max(lastProgress, progress),
      completed: false,
    });
  }

  const numericSpeed = finite(speed);
  if (!previousPosition || numericSpeed == null || numericSpeed < MIN_SPEED) return idle(dragon, false);

  const eligible = candidates
    .filter((geometry) => !insideGate(previousPosition, geometry.trace[0]) && insideGate(dragon, geometry.trace[0]))
    .sort((left, right) => distance3D(dragon, left.trace[0]) - distance3D(dragon, right.trace[0]) || left.corridorId.localeCompare(right.corridorId));
  const geometry = eligible[0] ?? null;
  if (!geometry) return idle(dragon, false);

  return Object.freeze({
    status: 'active',
    corridorId: geometry.corridorId,
    nextGateIndex: 1,
    previousPosition: dragon,
    lastProgress: progressAlong(dragon, geometry),
    completed: false,
  });
}

export function masteredAirLaneCleanRunPublicState(state, lanes = []) {
  const current = state && typeof state === 'object' ? state : createMasteredAirLaneCleanRunState();
  const available = !current.completed && Array.isArray(lanes) && lanes.some((lane) => laneGeometry(lane));
  if (current.completed) return Object.freeze({ available: false, active: false, phase: null, completed: true });
  if (current.status !== 'active') return Object.freeze({ available, active: false, phase: null, completed: false });
  const nextGateIndex = Number.isInteger(current.nextGateIndex) ? current.nextGateIndex : 1;
  const phase = phaseForGate(nextGateIndex);
  return Object.freeze({ available, active: PHASES.includes(phase), phase, completed: false });
}

export function masteredAirLaneCleanRunPresentationPolicy({ reducedMotion = false, mutedAudio = false } = {}) {
  return Object.freeze({
    reducedMotion: reducedMotion === true,
    mutedAudio: mutedAudio === true,
    atmosphereDurationMs: reducedMotion === true ? 1200 : 2200,
    soundHook: mutedAudio === true ? null : 'mastered-air-lane-clean-run',
  });
}
