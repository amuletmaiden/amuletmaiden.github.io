export const CURRENT_WORLD_CONTRACT_VERSION = 3;
export const MIN_SUPPORTED_WORLD_CONTRACT_VERSION = 2;

export function classifyWorldContract(report) {
  const version = Number.isInteger(report?.contractVersion) ? report.contractVersion : null;
  if (version == null) return result("malformed", false, null, "missing-contract-version");
  if (version > CURRENT_WORLD_CONTRACT_VERSION) return result("future", false, version, "unsupported-future-version");
  if (version < MIN_SUPPORTED_WORLD_CONTRACT_VERSION) return result("legacy-unsupported", false, version, "unsupported-legacy-version");
  if (version === CURRENT_WORLD_CONTRACT_VERSION) return result("current", true, version, null);
  return result("legacy-supported", true, version, "legacy-diagnostics-shape");
}

export function normalizeVersionedDiagnostics(report) {
  const compatibility = classifyWorldContract(report);
  const diagnostics = report?.diagnostics && typeof report.diagnostics === "object" ? report.diagnostics : {};
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const strings = (values) => [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))].sort();
  const codes = strings(diagnostics.codes ?? issues.map((entry) => entry?.code));
  const invariants = strings(diagnostics.invariants ?? issues.map((entry) => entry?.invariant));
  const severities = compatibility.version >= 3
    ? strings(diagnostics.severities ?? issues.map((entry) => entry?.severity))
    : [];
  return {
    compatibility,
    valid: report?.valid === true && compatibility.supported,
    issueCount: Number.isInteger(diagnostics.issueCount) ? Math.max(0, diagnostics.issueCount) : issues.length,
    codes,
    invariants,
    severities,
    highestSeverity: compatibility.version >= 3 && typeof diagnostics.highestSeverity === "string"
      ? diagnostics.highestSeverity
      : null,
  };
}

function result(status, supported, version, reason) {
  return {
    currentVersion: CURRENT_WORLD_CONTRACT_VERSION,
    minimumSupportedVersion: MIN_SUPPORTED_WORLD_CONTRACT_VERSION,
    version,
    status,
    supported,
    reason,
  };
}
