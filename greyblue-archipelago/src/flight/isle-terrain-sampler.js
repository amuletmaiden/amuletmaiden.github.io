const DEFAULT_RESOLUTION = 65;

export function createIsleTerrainSampler({
  THREE,
  root,
  bounds,
  resolution = DEFAULT_RESOLUTION,
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
  if (!meshes.length) return makeSampler(bounds, size, values, 0);

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

  return makeSampler(bounds, size, values, finiteSamples);
}

export function sampleTerrainGrid(field, x, z) {
  if (!field || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < field.minX || x > field.maxX || z < field.minZ || z > field.maxZ) return null;

  const gridX = (x - field.minX) / Math.max(field.maxX - field.minX, Number.EPSILON) * (field.columns - 1);
  const gridZ = (z - field.minZ) / Math.max(field.maxZ - field.minZ, Number.EPSILON) * (field.rows - 1);
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
  return totalWeight > Number.EPSILON ? weightedHeight / totalWeight : null;
}

function makeSampler(bounds, size, values, finiteSamples) {
  const field = Object.freeze({
    minX: Number(bounds.min.x),
    maxX: Number(bounds.max.x),
    minZ: Number(bounds.min.z),
    maxZ: Number(bounds.max.z),
    columns: size,
    rows: size,
    values,
    finiteSamples,
  });
  return Object.freeze({
    field,
    sample(x, z) {
      return sampleTerrainGrid(field, x, z);
    },
    telemetry: Object.freeze({ columns: size, rows: size, finiteSamples }),
  });
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

export { DEFAULT_RESOLUTION };
