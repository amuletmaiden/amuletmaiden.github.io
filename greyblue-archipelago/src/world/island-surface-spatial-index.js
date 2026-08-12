const DEFAULT_CELL_SIZE = 640;
const SURFACE_RADIUS_SCALE = 110;

export function createIslandSurfaceSpatialIndex(islands, { cellSize = DEFAULT_CELL_SIZE } = {}) {
  const source = Array.isArray(islands) ? [...islands] : [];
  const safeCellSize = Number.isFinite(cellSize) && cellSize >= 64 ? cellSize : DEFAULT_CELL_SIZE;
  const cells = new Map();

  source.forEach((island, order) => {
    if (!Number.isFinite(island?.x) || !Number.isFinite(island?.z) || !Number.isFinite(island?.scale)) return;
    const radius = Math.max(0, SURFACE_RADIUS_SCALE * island.scale);
    const minX = cellCoordinate(island.x - radius, safeCellSize);
    const maxX = cellCoordinate(island.x + radius, safeCellSize);
    const minZ = cellCoordinate(island.z - radius, safeCellSize);
    const maxZ = cellCoordinate(island.z + radius, safeCellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = `${x}:${z}`;
        const bucket = cells.get(key) ?? [];
        bucket.push({ island, order });
        cells.set(key, bucket);
      }
    }
  });

  return Object.freeze({
    query(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return Object.freeze([]);
      const bucket = cells.get(`${cellCoordinate(x, safeCellSize)}:${cellCoordinate(z, safeCellSize)}`) ?? [];
      return Object.freeze(bucket
        .slice()
        .sort((left, right) => left.order - right.order)
        .map(({ island }) => island));
    },
    telemetry() {
      return Object.freeze({ cellSize: safeCellSize, cellCount: cells.size, islandCount: source.length });
    },
  });
}

function cellCoordinate(value, cellSize) {
  return Math.floor(value / cellSize);
}
