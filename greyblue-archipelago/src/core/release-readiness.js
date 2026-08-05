const DEFAULT_SAVE_SCHEMA = 2;

function finiteString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeManifest(raw, kind) {
  const manifest = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const files = Array.isArray(manifest.files)
    ? [...new Set(manifest.files.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))].sort()
    : [];
  const optional = manifest.optional && typeof manifest.optional === 'object' && !Array.isArray(manifest.optional)
    ? Object.fromEntries(Object.entries(manifest.optional).map(([key, value]) => [key, Boolean(value)]).sort(([a], [b]) => a.localeCompare(b)))
    : {};

  return {
    kind,
    releaseId: finiteString(manifest.releaseId),
    status: finiteString(manifest.status),
    gameSafe: manifest.gameSafe === true,
    coordinateContract: finiteString(manifest.coordinateContract),
    scaleContract: finiteString(manifest.scaleContract),
    saveSchema: Number.isInteger(manifest.saveSchema) ? manifest.saveSchema : null,
    files,
    optional,
  };
}

function inspectManifest(raw, kind, requiredFiles, saveSchema) {
  const manifest = normalizeManifest(raw, kind);
  const failures = [];
  const omissions = [];
  const unreleased = manifest.status !== 'released' || !manifest.gameSafe;

  if (!manifest.releaseId) failures.push(`${kind}:missing-release-id`);
  if (unreleased) failures.push(`${kind}:not-released-game-safe`);
  if (!manifest.coordinateContract) failures.push(`${kind}:missing-coordinate-contract`);
  if (!manifest.scaleContract) failures.push(`${kind}:missing-scale-contract`);

  for (const file of requiredFiles) {
    if (!manifest.files.includes(file)) failures.push(`${kind}:missing-file:${file}`);
  }

  if (manifest.saveSchema !== null && manifest.saveSchema !== saveSchema) {
    failures.push(`${kind}:save-schema-${manifest.saveSchema}-expected-${saveSchema}`);
  }

  for (const [key, enabled] of Object.entries(manifest.optional)) {
    if (!enabled) omissions.push(`${kind}:optional:${key}`);
  }

  return { manifest, failures, omissions };
}

export function buildReleaseReadiness(input = {}) {
  const saveSchema = Number.isInteger(input.saveSchema) ? input.saveSchema : DEFAULT_SAVE_SCHEMA;
  const dragonRequiredFiles = Array.isArray(input.dragonRequiredFiles)
    ? [...new Set(input.dragonRequiredFiles.filter(finiteString))].sort()
    : ['dragon.glb'];
  const isleRequiredFiles = Array.isArray(input.isleRequiredFiles)
    ? [...new Set(input.isleRequiredFiles.filter(finiteString))].sort()
    : ['isle.glb'];

  const dragon = inspectManifest(input.dragonManifest, 'dragon', dragonRequiredFiles, saveSchema);
  const isle = inspectManifest(input.isleManifest, 'isle', isleRequiredFiles, saveSchema);
  const requiredFailures = [...dragon.failures, ...isle.failures].sort();
  const optionalOmissions = [...dragon.omissions, ...isle.omissions].sort();
  const fallbackReason = requiredFailures.length
    ? 'required-release-unavailable'
    : optionalOmissions.length
      ? 'optional-content-omitted'
      : null;

  const selected = {
    dragonReleaseId: requiredFailures.some((failure) => failure.startsWith('dragon:')) ? null : dragon.manifest.releaseId,
    isleReleaseId: requiredFailures.some((failure) => failure.startsWith('isle:')) ? null : isle.manifest.releaseId,
  };

  return Object.freeze({
    selected: Object.freeze(selected),
    requiredFailureCount: requiredFailures.length,
    optionalOmissionCount: optionalOmissions.length,
    requiredFailures: Object.freeze(requiredFailures),
    optionalOmissions: Object.freeze(optionalOmissions),
    fallbackReason,
    minimalPlayable: requiredFailures.length > 0,
    saveCompatibility: requiredFailures.every((failure) => !failure.includes(':save-schema-')),
    publicBuildReady: requiredFailures.length === 0,
    saveSchema,
  });
}
