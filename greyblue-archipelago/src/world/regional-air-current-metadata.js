const REGIONAL_AIR_CURRENTS = Object.freeze({
  "hushed-reach": Object.freeze({ x: 1.35, z: -1.8 }),
  "drowned-crown": Object.freeze({ x: -2.4, z: -0.9 }),
  "blueglass-wake": Object.freeze({ x: 1.1, z: 2.65 }),
  "widow-current": Object.freeze({ x: 0.35, z: -3.7 }),
  mothwater: Object.freeze({ x: 2.75, z: 0.65 }),
  "far-choir": Object.freeze({ x: -1.85, z: 2.4 }),
});

const CALM = Object.freeze({ x: 0, z: 0 });

export function regionalAirCurrentForRegion(regionId = null) {
  return REGIONAL_AIR_CURRENTS[String(regionId || "")] || CALM;
}

export const AUTHORED_REGIONAL_AIR_CURRENTS = REGIONAL_AIR_CURRENTS;
