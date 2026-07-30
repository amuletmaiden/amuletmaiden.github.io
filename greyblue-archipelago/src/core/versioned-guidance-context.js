export function createVersionedGuidanceContext({ validation, diagnostics, routeIds, discoveredRoutes } = {}) {
  const compatibility = diagnostics?.compatibility;
  const supported = compatibility?.supported === true;
  const version = Number.isInteger(compatibility?.version) ? compatibility.version : null;
  const status = typeof compatibility?.status === "string" ? compatibility.status : "malformed";

  const safeValidation = supported
    ? {
        contractVersion: version,
        valid: validation?.valid === true && diagnostics?.valid === true,
        issues: Array.isArray(validation?.issues) ? validation.issues : [],
        diagnostics: {
          issueCount: integerOr(diagnostics?.issueCount, 0),
          highestSeverity: version >= 3 && typeof diagnostics?.highestSeverity === "string"
            ? diagnostics.highestSeverity
            : null,
          severities: version >= 3 ? stringList(diagnostics?.severities) : [],
          codes: stringList(diagnostics?.codes),
          invariants: stringList(diagnostics?.invariants),
        },
      }
    : {
        contractVersion: version,
        valid: false,
        issues: [{
          severity: "critical",
          code: "validator-contract",
          invariant: "validator-contract-supported",
          message: compatibility?.reason || "unsupported validator contract",
        }],
        diagnostics: {
          issueCount: 1,
          highestSeverity: "critical",
          severities: ["critical"],
          codes: ["validator-contract"],
          invariants: ["validator-contract-supported"],
        },
      };

  return {
    validation: safeValidation,
    routeIds: stringList(routeIds),
    discoveredRoutes: stringList(discoveredRoutes),
    validationCompatibility: {
      version,
      status,
      supported,
      reason: compatibility?.reason || null,
    },
  };
}

function stringList(values) {
  const source = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return [...new Set(source.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))].sort();
}

function integerOr(value, fallback) {
  return Number.isInteger(value) ? Math.max(0, value) : fallback;
}
