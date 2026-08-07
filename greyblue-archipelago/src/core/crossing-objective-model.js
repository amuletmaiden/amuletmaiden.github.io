const TAU = Math.PI * 2;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapRadians(value) {
  const angle = finite(value, 0);
  return ((angle % TAU) + TAU) % TAU;
}

function shortestAngle(target, source) {
  return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}

function boundedText(value, fallback, maximum = 80) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maximum);
}

function destinationFrom(world, id) {
  if (!id || !Array.isArray(world?.islands)) return null;
  const island = world.islands.find((entry) => entry?.id === id);
  if (!island) return null;
  return {
    id,
    name: boundedText(island.name, id),
    x: finite(island.x),
    z: finite(island.z),
  };
}

function frozenSnapshot(value) {
  return Object.freeze({ ...value });
}

export function createCrossingObjectiveModel({ arrivalRadius = 140 } = {}) {
  const safeArrivalRadius = clamp(finite(arrivalRadius, 140), 60, 280);
  let active = null;
  let completedRouteIds = new Set();

  function latch(guidance, world) {
    const routeId = boundedText(guidance?.routeId, '', 120);
    const destinationId = boundedText(
      guidance?.destinationIslandId ?? guidance?.destinationId,
      '',
      120,
    );
    if (!routeId || !destinationId || completedRouteIds.has(routeId)) return false;
    const destination = destinationFrom(world, destinationId);
    if (!destination) return false;

    const totalDistance = Math.max(
      safeArrivalRadius + 1,
      finite(guidance?.distance, finite(guidance?.remainingDistance, safeArrivalRadius + 1)),
    );
    active = {
      routeId,
      destination,
      totalDistance,
      minimumAltitude: Math.max(0, finite(guidance?.minimumAltitude, 0)),
      fogRisk: boundedText(guidance?.fogRisk?.level, 'unknown', 16).toLowerCase(),
      arrived: false,
    };
    return true;
  }

  function update({ guidance = null, position = null, yaw = 0, world = null } = {}) {
    const incomingRouteId = boundedText(guidance?.routeId, '', 120);
    if (incomingRouteId && incomingRouteId !== active?.routeId) latch(guidance, world);
    if (!active && guidance) latch(guidance, world);

    if (!active) {
      return frozenSnapshot({
        visible: false,
        changed: false,
        routeId: null,
        destinationId: null,
        destinationName: '',
        phase: 'idle',
        progress: 0,
        remainingDistance: 0,
        turn: 'ahead',
        altitudeAdvice: '',
        fogRisk: 'unknown',
        arrived: false,
      });
    }

    const x = finite(position?.x);
    const z = finite(position?.z);
    const altitude = finite(position?.y);
    const dx = active.destination.x - x;
    const dz = active.destination.z - z;
    const remainingDistance = Math.hypot(dx, dz);
    const bearing = wrapRadians(Math.atan2(dx, dz));
    const headingError = shortestAngle(bearing, wrapRadians(yaw));
    const progress = clamp(1 - remainingDistance / active.totalDistance, 0, 1);
    const arrived = remainingDistance <= safeArrivalRadius;
    if (arrived && !active.arrived) {
      active.arrived = true;
      completedRouteIds.add(active.routeId);
    }

    const phase = arrived
      ? 'arrived'
      : remainingDistance <= 260
        ? 'final'
        : remainingDistance <= 760
          ? 'approach'
          : progress <= 0.08
            ? 'departure'
            : 'crossing';
    const turn = Math.abs(headingError) < 0.12 ? 'ahead' : headingError > 0 ? 'right' : 'left';
    const altitudeMargin = altitude - active.minimumAltitude;
    const altitudeAdvice = active.minimumAltitude > 0 && altitudeMargin < 0
      ? `climb ${Math.ceil(Math.abs(altitudeMargin))}`
      : active.minimumAltitude > 0 && altitudeMargin < 35
        ? 'hold altitude'
        : '';

    return frozenSnapshot({
      visible: true,
      changed: true,
      routeId: active.routeId,
      destinationId: active.destination.id,
      destinationName: active.destination.name,
      phase,
      progress,
      remainingDistance,
      bearing,
      headingError,
      turn,
      altitudeAdvice,
      fogRisk: active.fogRisk,
      arrived,
    });
  }

  function cancel() {
    const cancelledRouteId = active?.routeId ?? null;
    active = null;
    return cancelledRouteId;
  }

  function clearArrival() {
    if (!active?.arrived) return false;
    active = null;
    return true;
  }

  function snapshot() {
    return frozenSnapshot({
      activeRouteId: active?.routeId ?? null,
      destinationId: active?.destination?.id ?? null,
      arrived: Boolean(active?.arrived),
      completedRouteIds: Object.freeze([...completedRouteIds].sort()),
    });
  }

  return Object.freeze({ update, cancel, clearArrival, snapshot });
}
