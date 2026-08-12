export function shouldRevealLandmarkEncounter({ event, encounterView, currentRegionId } = {}) {
  if (!event || typeof event !== 'object') return false;
  if (!encounterView || typeof encounterView !== 'object') return false;
  if (encounterView.visible !== true || encounterView.available !== true || encounterView.visited === true) return false;

  const landmarkId = event.landmarkId;
  const regionId = event.regionId;
  if (landmarkId === null || landmarkId === undefined) return false;
  if (regionId === null || regionId === undefined) return false;
  if (currentRegionId === null || currentRegionId === undefined) return false;

  return landmarkId === encounterView.landmarkId && regionId === currentRegionId;
}
