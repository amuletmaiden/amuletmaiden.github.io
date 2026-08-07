const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function createAtmosphereResponseModel() {
  let previousKey = "";

  return Object.freeze({
    update(rawState = {}) {
      const flight = rawState?.flight || {};
      const position = rawState?.position || {};
      const surface = rawState?.surface || {};
      const fog = rawState?.fog || {};
      const region = rawState?.currentRegion || null;
      const speed = Math.max(0, finite(flight.speed));
      const altitude = finite(position.y);
      const surfaceHeight = finite(surface.height);
      const clearance = Math.max(0, altitude - surfaceHeight);
      const fogDensity = Math.max(0, finite(fog.effectiveDensity, finite(fog.density)));

      const speedPressure = clamp((speed - 18) / 90, 0, 1);
      const lowClearance = clamp((42 - clearance) / 42, 0, 1);
      const fogPressure = clamp(fogDensity / 0.0012, 0, 1);
      const waterSkim = surface.surface === "water" ? clamp((34 - clearance) / 34, 0, 1) : 0;
      const terrainSkim = surface.surface === "terrain" ? clamp((28 - clearance) / 28, 0, 1) : 0;
      const highAltitude = clamp((altitude - 650) / 850, 0, 1);

      let mode = "cruise";
      if (fogPressure > 0.72) mode = "fog";
      else if (waterSkim > 0.5) mode = "water-skim";
      else if (terrainSkim > 0.5) mode = "terrain-skim";
      else if (speedPressure > 0.72) mode = "fast";
      else if (highAltitude > 0.6) mode = "high";

      const regionName = typeof region?.name === "string" ? region.name.slice(0, 64) : "Open Greyblue";
      const key = [mode, Math.round(speedPressure * 10), Math.round(fogPressure * 10), Math.round(lowClearance * 10), regionName].join("|");
      const changed = key !== previousKey;
      previousKey = key;

      return Object.freeze({
        changed,
        mode,
        regionName,
        speedPressure,
        fogPressure,
        lowClearance,
        waterSkim,
        terrainSkim,
        highAltitude,
        clearance,
      });
    },
  });
}
