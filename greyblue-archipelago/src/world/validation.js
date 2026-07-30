export const WORLD_CONTRACT_VERSION = 2;

export function validateWorldContract(world) {
  const issues = [];
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const regions = Array.isArray(world?.regions) ? world.regions : [];

  const islandIds = collectIds(islands, "island", issues);
  const routeIds = collectIds(routes, "route", issues);
  const regionIds = collectIds(regions, "region", issues);
  const discoveryIds = new Set();
  const regionById = new Map(regions.filter((entry) => validId(entry?.id)).map((entry) => [entry.id, entry]));

  for (const island of islands) {
    const id = validId(island?.id) ? island.id : "<unknown-island>";
    if (!regionIds.has(island?.regionId)) {
      issues.push(issue("island-region", id, `unknown region ${String(island?.regionId)}`, "island-region-known"));
    }
  }

  for (const route of routes) {
    const id = validId(route?.id) ? route.id : "<unknown-route>";
    if (!islandIds.has(route?.fromIslandId)) issues.push(issue("route-endpoint", id, `unknown origin ${String(route?.fromIslandId)}`, "route-origin-known"));
    if (!islandIds.has(route?.toIslandId)) issues.push(issue("route-endpoint", id, `unknown destination ${String(route?.toIslandId)}`, "route-destination-known"));
    if (route?.fromIslandId === route?.toIslandId && validId(route?.fromIslandId)) issues.push(issue("route-loop", id, "origin and destination are identical", "route-distinct-endpoints"));

    const navigation = route?.navigation;
    for (const field of ["distance", "bearingFrom", "bearingTo", "minimumAltitude", "cruiseAltitude"]) {
      if (!Number.isFinite(navigation?.[field])) issues.push(issue("route-navigation", id, `${field} is not finite`, `route-${field}-finite`));
    }
    if (Number.isFinite(navigation?.distance) && navigation.distance <= 0) issues.push(issue("route-navigation", id, "distance must be positive", "route-distance-positive"));
    for (const field of ["bearingFrom", "bearingTo"]) {
      if (Number.isFinite(navigation?.[field]) && (navigation[field] < 0 || navigation[field] >= Math.PI * 2)) {
        issues.push(issue("route-navigation", id, `${field} must be within [0, 2pi)`, `route-${field}-bounded`));
      }
    }
    if (Number.isFinite(navigation?.minimumAltitude) && Number.isFinite(navigation?.cruiseAltitude)
      && navigation.cruiseAltitude <= navigation.minimumAltitude) {
      issues.push(issue("route-navigation", id, "cruiseAltitude must exceed minimumAltitude", "route-altitude-band"));
    }
    const fogScore = navigation?.fogRisk?.score;
    if (!Number.isFinite(fogScore) || fogScore < 0 || fogScore > 1) {
      issues.push(issue("route-fog-risk", id, "fog risk score must be within [0, 1]", "route-fog-risk-bounded"));
    }

    const discoveryId = route?.discovery?.id;
    if (!validId(discoveryId)) {
      issues.push(issue("route-discovery", id, "missing stable discovery id", "route-discovery-id"));
    } else if (discoveryIds.has(discoveryId)) {
      issues.push(issue("route-discovery", id, `duplicate discovery id ${discoveryId}`, "route-discovery-unique"));
    } else {
      discoveryIds.add(discoveryId);
    }
    const endpoints = route?.discovery?.endpointIslandIds;
    if (!Array.isArray(endpoints) || endpoints[0] !== route?.fromIslandId || endpoints[1] !== route?.toIslandId) {
      issues.push(issue("route-discovery", id, "endpointIslandIds do not match route endpoints", "route-discovery-endpoints"));
    }
  }

  for (const region of regions) {
    const id = validId(region?.id) ? region.id : "<unknown-region>";
    const adjacent = Array.isArray(region?.adjacentRegionIds) ? region.adjacentRegionIds : [];
    const uniqueAdjacent = new Set(adjacent);
    if (uniqueAdjacent.size !== adjacent.length) issues.push(issue("region-adjacency", id, "adjacentRegionIds contain duplicates", "region-adjacency-unique"));
    if (uniqueAdjacent.has(id)) issues.push(issue("region-adjacency", id, "region cannot be adjacent to itself", "region-adjacency-no-self"));
    const sorted = [...adjacent].sort((left, right) => String(left).localeCompare(String(right)));
    if (JSON.stringify(sorted) !== JSON.stringify(adjacent)) issues.push(issue("region-adjacency", id, "adjacentRegionIds must be sorted", "region-adjacency-sorted"));
    for (const neighborId of adjacent) {
      if (!regionIds.has(neighborId)) {
        issues.push(issue("region-adjacency", id, `unknown adjacent region ${String(neighborId)}`, "region-adjacency-known"));
        continue;
      }
      const neighbor = regionById.get(neighborId);
      if (!Array.isArray(neighbor?.adjacentRegionIds) || !neighbor.adjacentRegionIds.includes(id)) {
        issues.push(issue("region-adjacency", id, `adjacency with ${neighborId} is not symmetric`, "region-adjacency-symmetric"));
      }
    }
  }

  issues.sort((left, right) => left.code.localeCompare(right.code)
    || left.subject.localeCompare(right.subject)
    || left.invariant.localeCompare(right.invariant)
    || left.message.localeCompare(right.message));

  const diagnostics = summarizeIssues(issues);
  return {
    contractVersion: WORLD_CONTRACT_VERSION,
    valid: issues.length === 0,
    counts: {
      islands: islands.length,
      routes: routes.length,
      regions: regions.length,
      uniqueIslandIds: islandIds.size,
      uniqueRouteIds: routeIds.size,
      uniqueRegionIds: regionIds.size,
      uniqueRouteDiscoveryIds: discoveryIds.size,
    },
    diagnostics,
    issues,
  };
}

function collectIds(records, kind, issues) {
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.id;
    if (!validId(id)) {
      issues.push(issue(`${kind}-id`, `${kind}:${index}`, "missing stable id", `${kind}-id-present`));
      continue;
    }
    if (ids.has(id)) issues.push(issue(`${kind}-id`, id, "duplicate id", `${kind}-id-unique`));
    ids.add(id);
  }
  return ids;
}

function summarizeIssues(issues) {
  const byCode = {};
  const byInvariant = {};
  for (const entry of issues) {
    byCode[entry.code] = (byCode[entry.code] || 0) + 1;
    byInvariant[entry.invariant] = (byInvariant[entry.invariant] || 0) + 1;
  }
  return {
    issueCount: issues.length,
    codes: Object.keys(byCode).sort(),
    invariants: Object.keys(byInvariant).sort(),
    byCode: Object.fromEntries(Object.entries(byCode).sort(([left], [right]) => left.localeCompare(right))),
    byInvariant: Object.fromEntries(Object.entries(byInvariant).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(code, subject, message, invariant) {
  return { code, subject: String(subject), invariant, message };
}
