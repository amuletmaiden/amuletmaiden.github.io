function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}

function relativeBearing(targetBearing, yaw) {
  const delta = Math.atan2(Math.sin(targetBearing - yaw), Math.cos(targetBearing - yaw));
  const degrees = Math.round(delta * 180 / Math.PI);
  if (Math.abs(degrees) <= 8) return { direction: 'ahead', degrees: 0 };
  return { direction: degrees > 0 ? 'right' : 'left', degrees: Math.abs(degrees) };
}

function phaseFor({ distance, clearance, speed, landingRequested, airborne }) {
  if (!airborne) return 'landed';
  if (landingRequested && distance <= 90 && clearance <= 24) return 'flare';
  if (landingRequested && distance <= 240) return 'final';
  if (distance <= 420) return 'approach';
  return 'inbound';
}

function adviceFor({ phase, bearing, clearance, speed }) {
  if (phase === 'landed') return 'Touchdown complete.';
  if (phase === 'flare') return clearance > 18 ? 'Hold the flare and sink gently.' : 'Ease down onto the landing zone.';
  if (phase === 'final') {
    if (bearing.direction !== 'ahead' && bearing.degrees > 18) return `Correct ${bearing.direction} ${bearing.degrees}° before touchdown.`;
    if (speed > 78) return 'Bleed speed on final.';
    if (clearance > 52) return 'Descend toward the landing zone.';
    return 'Hold the line into the flare.';
  }
  if (phase === 'approach') {
    if (bearing.direction !== 'ahead') return `Bring the landing zone ${bearing.direction} ${bearing.degrees}°.`;
    if (clearance < 34) return 'Climb slightly before the final approach.';
    return 'Landing zone ahead.';
  }
  return bearing.direction === 'ahead'
    ? 'Continue inbound.'
    : `Turn ${bearing.direction} ${bearing.degrees}° for the landing zone.`;
}

export function deriveLandingApproach(state = {}) {
  const nearest = state?.nearestIsland ?? null;
  const zone = nearest?.landingZone ?? null;
  const position = state?.position ?? {};
  const flight = state?.flight ?? {};
  const surface = state?.surface ?? {};

  const airborne = Boolean(flight.airborne ?? state?.collision?.airborne ?? true);
  const landingRequested = Boolean(flight.landingRequested ?? state?.collision?.landingRequested ?? false);
  const yaw = finite(flight.yaw, 0);
  const speed = Math.max(0, finite(flight.speed, 0));
  const altitude = finite(position.y, 0);
  const surfaceHeight = finite(surface.height, 0);
  const clearance = Math.max(0, altitude - surfaceHeight);

  if (!nearest || !zone) {
    return freeze({
      visible: false,
      islandName: nearest?.name || '',
      phase: 'none',
      distance: 0,
      bearing: { direction: 'ahead', degrees: 0 },
      clearance: Math.round(clearance),
      speed: Math.round(speed),
      advice: '',
      compactLabel: 'No landing zone nearby',
    });
  }

  const dx = finite(zone.x, finite(nearest?.x, 0)) - finite(position.x, 0);
  const dz = finite(zone.z, finite(nearest?.z, 0)) - finite(position.z, 0);
  const distance = Math.max(0, finite(zone.distance, Math.hypot(dx, dz)));
  const targetBearing = Math.atan2(dx, dz);
  const bearing = relativeBearing(targetBearing, yaw);
  const phase = phaseFor({ distance, clearance, speed, landingRequested, airborne });
  const advice = adviceFor({ phase, bearing, clearance, speed });
  const islandName = String(nearest.name || nearest.id || 'nearby isle').slice(0, 80);
  const roundedDistance = Math.round(clamp(distance, 0, 99999));
  const roundedClearance = Math.round(clamp(clearance, 0, 99999));
  const roundedSpeed = Math.round(clamp(speed, 0, 9999));

  return freeze({
    visible: distance <= 850 || landingRequested || !airborne,
    islandName,
    phase,
    distance: roundedDistance,
    bearing,
    clearance: roundedClearance,
    speed: roundedSpeed,
    advice,
    compactLabel: `${islandName}. ${phase}. ${roundedDistance} distance. ${bearing.direction}${bearing.degrees ? ` ${bearing.degrees} degrees` : ''}. ${advice}`,
  });
}
