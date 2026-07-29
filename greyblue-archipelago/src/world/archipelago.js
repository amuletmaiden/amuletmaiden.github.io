export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildArchipelago({ seed = 1337, count = 48, radius = 9000, minGap = 420 } = {}) {
  const random = mulberry32(seed);
  const islands = [];
  let attempts = 0;

  while (islands.length < count && attempts++ < count * 200) {
    const angle = random() * Math.PI * 2;
    const distance = 500 + Math.sqrt(random()) * radius;
    const island = {
      id: `isle-${islands.length}`,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      scale: 0.65 + random() * 2.4,
      height: 80 + random() * 520,
      landmark: random() > 0.72,
      landingRadius: 70 + random() * 120,
    };

    const separated = islands.every((other) =>
      Math.hypot(other.x - island.x, other.z - island.z) >=
      minGap * (other.scale + island.scale) * 0.5,
    );

    if (separated) islands.push(island);
  }

  return { seed, islands };
}

export function activeIslands(world, position, range = 1800) {
  const rangeSquared = range * range;
  return world.islands.filter((island) => {
    const dx = island.x - position.x;
    const dz = island.z - position.z;
    return dx * dx + dz * dz <= rangeSquared;
  });
}
