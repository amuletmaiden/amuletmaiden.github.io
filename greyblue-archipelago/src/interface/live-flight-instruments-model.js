const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function deriveFlightInstruments(state = {}) {
  const flight = state?.flight || {};
  const position = state?.position || {};
  const surface = state?.surface || {};
  const speed = Math.max(0, finite(flight.speed));
  const altitude = finite(position.y);
  const surfaceHeight = finite(surface.height);
  const clearance = Math.max(0, altitude - surfaceHeight);
  const verticalSpeed = finite(flight?.velocity?.y);
  const stallFactor = clamp(finite(flight.stallFactor), 0, 1);
  const mode = typeof flight.mode === 'string' && flight.mode.trim()
    ? flight.mode.trim()
    : flight.airborne === false ? 'grounded' : 'flight';

  let caution = '';
  if (state?.collision?.requiresRecovery) caution = 'RECOVER';
  else if (stallFactor >= 0.55) caution = 'STALL';
  else if (flight.airborne !== false && clearance < 18 && verticalSpeed < -3) caution = 'GROUND';
  else if (flight.landingRequested) caution = 'LANDING';

  const trend = verticalSpeed > 1.5 ? 'climbing' : verticalSpeed < -1.5 ? 'descending' : 'level';
  const view = {
    mode: mode.replaceAll('-', ' ').toUpperCase(),
    speed: `${Math.round(speed)}`,
    altitude: `${Math.round(altitude)}`,
    clearance: `${Math.round(clearance)}`,
    trend,
    caution,
    compactLabel: `${Math.round(speed)} SPD · ${Math.round(altitude)} ALT${caution ? ` · ${caution}` : ''}`,
  };

  return Object.freeze({
    ...view,
    telemetry: Object.freeze({
      speed,
      altitude,
      clearance,
      verticalSpeed,
      stallFactor,
    }),
  });
}
