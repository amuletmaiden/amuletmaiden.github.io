const DEFAULT_RESOLUTION = 65;
const DEFAULT_EDGE_CLAMP_CELLS = 0.5;
const DEFAULT_SPARSE_SEARCH_RADIUS = 1;

export function createIsleTerrainSampler({
  THREE,
  root,
  bounds,
  resolution = DEFAULT_RESOLUTION,
  edgeClampCells = DEFAULT_EDGE_CLAMP_CELLS,
  sparseSearchRadius = DEFAULT_SPARSE_SEARCH_RADIUS,
} = {}) {
  if (!THREE?.Raycaster || !THREE?.Vector3) {
    throw new TypeError("THREE Raycaster and Vector3 are required");
  }
  if (!root?.traverse || !bounds?.min || !bounds?.max) {
    throw new TypeError("a loaded Isle root and bounds are required");
  }
  const size = Number(resolution);
  if (!Number.isInteger(size) || size < 3 || size > 257) {
    throw new RangeError("terrain sampler resolution must be an integer from 3 to 257");
  }

  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object?.isMesh && object.visible !== false && object.geometry) meshes.push(object);
  });

  const values = new Float32Array(size * size);
  values.fill(Number.NaN);
  if (!meshes.length) {
    return makeSampler(bounds, size, values, 0, edgeClampCells, sparseSearchRadius);
  }

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const downward = new THREE.Vector3(0, -1, 0);
  const verticalSpan = Math.max(1, bounds.max.y - bounds.min.y);
  const margin = Math.max(8, verticalSpan * 0.08);
  const rayTop = bounds.max.y + margin;
  raycaster.near = 0;
  raycaster.far = verticalSpan + margin * 2;

  let finiteSamples = 0;
  for (let row = 0; row < size; row += 1) {
    const z = lerp(bounds.min.z, bounds.max.z, row / (size - 1));
    for (let column = 0; column < size; column += 1) {
      const x = lerp(bounds.min.x, bounds.max.x, column / (size - 1));
      raycaster.set(origin.set(x, rayTop, z), downward);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!Number.isFinite(hit?.point?.y)) continue;
      values[row * size + column] = hit.point.y;
      finiteSamples += 1;
    }
  }

  return makeSampler(bounds, size, values, finiteSamples, edgeClampCells, sparseSearchRadius);
}

export function sampleTerrainGrid(field, x, z, options = {}) {
  if (!validField(field) || !Number.isFinite(x) || !Number.isFinite(z)) return null;

  const edgeClampCells = finiteNonNegative(options.edgeClampCells, field.edgeClampCells ?? DEFAULT_EDGE_CLAMP_CELLS);
  const sparseSearchRadius = integerInRange(
    options.sparseSearchRadius,
    field.sparseSearchRadius ?? DEFAULT_SPARSE_SEARCH_RADIUS,
    0,
    8,
  );
  const cellX = (field.maxX - field.minX) / Math.max(field.columns - 1, 1);
  const cellZ = (field.maxZ - field.minZ) / Math.max(field.rows - 1, 1);
  const clampX = cellX * edgeClampCells;
  const clampZ = cellZ * edgeClampCells;

  if (x < field.minX - clampX || x > field.maxX + clampX
    || z < field.minZ - clampZ || z > field.maxZ + clampZ) {
    return null;
  }

  const clampedX = clamp(x, field.minX, field.maxX);
  const clampedZ = clamp(z, field.minZ, field.maxZ);
  const gridX = (clampedX - field.minX) / Math.max(field.maxX - field.minX, Number.EPSILON) * (field.columns - 1);
  const gridZ = (clampedZ - field.minZ) / Math.max(field.maxZ - field.minZ, Number.EPSILON) * (field.rows - 1);
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(x0 + 1, field.columns - 1);
  const z1 = Math.min(z0 + 1, field.rows - 1);
  const tx = gridX - x0;
  const tz = gridZ - z0;
  const samples = [
    [z0 * field.columns + x0, (1 - tx) * (1 - tz)],
    [z0 * field.columns + x1, tx * (1 - tz)],
    [z1 * field.columns + x0, (1 - tx) * tz],
    [z1 * field.columns + x1, tx * tz],
  ];

  let weightedHeight = 0;
  let totalWeight = 0;
  for (const [index, weight] of samples) {
    const height = field.values[index];
    if (!Number.isFinite(height) || weight <= 0) continue;
    weightedHeight += height * weight;
    totalWeight += weight;
  }
  if (totalWeight > Number.EPSILON) return weightedHeight / totalWeight;

  return nearestFiniteHeight(field, Math.round(gridX), Math.round(gridZ), sparseSearchRadius);
}

function nearestFiniteHeight(field, centerX, centerZ, radius) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
    const row = centerZ + offsetZ;
    if (row < 0 || row >= field.rows) continue;
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const column = centerX + offsetX;
      if (column < 0 || column >= field.columns) continue;
      const height = field.values[row * field.columns + column];
      if (!Number.isFinite(height)) continue;
      const distance = offsetX * offsetX + offsetZ * offsetZ;
      if (distance < bestDistance) {
        best = height;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function makeSampler(bounds, size, values, finiteSamples, edgeClampCells, sparseSearchRadius) {
  const field = Object.freeze({
    minX: Number(bounds.min.x),
    maxX: Number(bounds.max.x),
    minZ: Number(bounds.min.z),
    maxZ: Number(bounds.max.z),
    columns: size,
    rows: size,
    values,
    finiteSamples,
    edgeClampCells: finiteNonNegative(edgeClampCells, DEFAULT_EDGE_CLAMP_CELLS),
    sparseSearchRadius: integerInRange(sparseSearchRadius, DEFAULT_SPARSE_SEARCH_RADIUS, 0, 8),
  });
  return Object.freeze({
    field,
    sample(x, z) {
      return sampleTerrainGrid(field, x, z);
    },
    telemetry: Object.freeze({
      columns: size,
      rows: size,
      finiteSamples,
      edgeClampCells: field.edgeClampCells,
      sparseSearchRadius: field.sparseSearchRadius,
    }),
  });
}

function validField(field) {
  return Boolean(field)
    && Number.isFinite(field.minX)
    && Number.isFinite(field.maxX)
    && Number.isFinite(field.minZ)
    && Number.isFinite(field.maxZ)
    && field.maxX > field.minX
    && field.maxZ > field.minZ
    && Number.isInteger(field.columns)
    && Number.isInteger(field.rows)
    && field.columns >= 2
    && field.rows >= 2
    && field.values?.length === field.columns * field.rows;
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function integerInRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

export {
  DEFAULT_EDGE_CLAMP_CELLS,
  DEFAULT_RESOLUTION,
  DEFAULT_SPARSE_SEARCH_RADIUS,
};