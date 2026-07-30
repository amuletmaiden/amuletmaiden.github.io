export function validateWorldContract(world) {
  const issues = [];
  const islands = Array.isArray(world?.islands) ? world.islands : [];
  const routes = Array.isArray(world?.routes) ? world.routes : [];
  const regions = Array.isArray(world?.regions) ? world.regions : [];

  const islandIds = collectIds(islands, "island", issues);
  const routeIds = collectIds(routes, "route", issues);
  const regionIds = collectIds(regions, "region", issues);
  const regionById = new Map(regions.filter((entry) => validId(entry?.id)).map((entry) => [entry.id, entry]));

  for (const route of routes) {
    const id = validId(route?.id) ? route.id : "<unknown-route>";
    if (!islandIds.has(route?.fromIslandId)) issues.push(issue("route-endpoint", id, `unknown origin ${String(route?.fromIslandId)}`));
    if (!islandIds.has(route?.toIslandId)) issues.push(issue("route-endpoint", id, `unknown destination ${String(route?.toIslandId)}`));
    if (route?.fromIslandId === route?.toIslandId && validId(route?.fromIslandId)) issues.push(issue("route-loop", id, "origin and destination are identical"));

    const navigation = route?.navigation;
    for (const field of ["distance", "bearingFrom", "bearingTo", "minimumAltitude", "cruiseAltitude"]) {
      if (!Number.isFinite(navigation?.[field])) issues.push(issue("route-navigation", id, `${field} is not finite`));
    }
    if (Number.isFinite(navigation?.distance) && navigation.distance <= 0) issues.push(issue("route-navigation", id, "distance must be positive"));
    if (Number.isFinite(navigation?.minimumAltitude) && Number.isFinite(navigation?.cruiseAltitude)
      && navigation.cruiseAltitude <= navigation.minimumAltitude) {
      issues.push(issue("route-navigation", id, "cruiseAltitude must exceed minimumAltitude"));
    }
    if (!validId(route?.discovery?.id)) issues.push(issue("route-discovery", id, "missing stable discovery id"));
    const endpoints = route?.discovery?.endpointIslandIds;
    if (!Array.isArray(endpoints) || endpoints[0] !== route?.fromIslandId || endpoints[1] !== route?.toIslandId) {
      issues.push(issue("route-discovery", id, "endpointIslandIds do not match route endpoints"));
    }
  }

  for (const region of regions) {
    const id = validId(region?.id) ? region.id : "<unknown-region>";
    const adjacent = Array.isArray(region?.adjacentRegionIds) ? region.adjacentRegionIds : [];
    for (const neighborId of adjacent) {
      if (!regionIds.has(neighborId)) {
        issues.push(issue("region-adjacency", id, `unknown adjacent region ${String(neighborId)}`));
        continue;
      }
      const neighbor = regionById.get(neighborId);
      if (!Array.isArray(neighbor?.adjacentRegionIds) || !neighbor.adjacentRegionIds.includes(id)) {
        issues.push(issue("region-adjacency", id, `adjacency with ${neighborId} is not symmetric`));
      }
    }
  }

  issues.sort((left, right) => left.code.localeCompare(right.code)
    || left.subject.localeCompare(right.subject)
    || left.message.localeCompare(right.message));

  return {
    valid: issues.length === 0,
    counts: {
      islands: islands.length,
      routes: routes.length,
      regions: regions.length,
      uniqueIslandIds: islandIds.size,
      uniqueRouteIds: routeIds.size,
      uniqueRegionIds: regionIds.size,
    },
    issues,
  };
}

function collectIds(records, kind, issues) {
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.id;
    if (!validId(id)) {
      issues.push(issue(`${kind}-id`, `${kind}:${index}`, "missing stable id"));
      continue;
    }
    if (ids.has(id)) issues.push(issue(`${kind}-id`, id, "duplicate id"));
    ids.add(id);
  }
  return ids;
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(code, subject, message) {
  return { code, subject: String(subject), message };
}
