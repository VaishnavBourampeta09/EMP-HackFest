import { distanceToPathMeters, haversineMeters } from "./geo.js";

/**
 * Turns a planned route plus the live Redmond incident feed into the three
 * things a rider actually needs before they set off: what is nearby, what is
 * worth warning about, and how the candidate routes compare.
 *
 * Everything here is derived from data already returned by /api/plan, so it
 * stays consistent with the score the routing engine produced.
 */

/** Incidents sorted by how close they fall to the route the rider selected. */
export function incidentsNearRoute(incidents = [], route, options = {}) {
  const { withinMeters = 400, limit = 12 } = options;
  const points = route?.points ?? [];
  if (points.length === 0) return [];

  return incidents
    .filter((incident) => Number.isFinite(incident?.lat) && Number.isFinite(incident?.lng))
    .map((incident) => ({
      ...incident,
      distanceMeters: Math.round(
        distanceToPathMeters([incident.lat, incident.lng], points),
      ),
    }))
    .filter((incident) => incident.distanceMeters <= withinMeters)
    .sort((a, b) => {
      // Severity first, then recency, then proximity — the order a person
      // would scan them in.
      const severity = (b.severity ?? 0) - (a.severity ?? 0);
      if (severity !== 0) return severity;
      const recency = (a.recencyDays ?? 999) - (b.recencyDays ?? 999);
      if (recency !== 0) return recency;
      return a.distanceMeters - b.distanceMeters;
    })
    .slice(0, limit);
}

const SEVERE_CATEGORIES = new Set(["violent_crime", "collision"]);

/**
 * Plain-language warnings for the selected route. Each one names a concrete,
 * checkable condition rather than a vague risk label.
 */
export function routeWarnings(route, nearbyIncidents = [], options = {}) {
  const { afterDark = false, alternatives = [] } = options;
  const warnings = [];

  const severeRecent = nearbyIncidents.filter(
    (incident) =>
      SEVERE_CATEGORIES.has(incident.category) && (incident.recencyDays ?? 999) <= 30,
  );
  if (severeRecent.length > 0) {
    const closest = severeRecent.reduce((a, b) =>
      a.distanceMeters <= b.distanceMeters ? a : b,
    );
    warnings.push({
      id: "severe-recent",
      level: "high",
      title: `${severeRecent.length} serious incident${severeRecent.length === 1 ? "" : "s"} reported in the last month`,
      detail: `Closest is ${closest.categoryLabel?.toLowerCase() ?? "an incident"} about ${closest.distanceMeters} m from your path near ${closest.generalizedLocation ?? "this route"}.`,
    });
  }

  const veryClose = nearbyIncidents.filter((incident) => incident.distanceMeters <= 80);
  if (veryClose.length >= 3) {
    warnings.push({
      id: "clustered",
      level: "medium",
      title: `${veryClose.length} reports sit directly on this path`,
      detail:
        "This route passes within about a block of several mapped reports. A slightly longer option may avoid the cluster.",
    });
  }

  if (afterDark) {
    warnings.push({
      id: "after-dark",
      level: "medium",
      title: "Travelling after dark",
      detail:
        "Sentinel has shifted the ranking to 85% safety and 15% travel time, and weights lighting gaps more heavily for this trip.",
    });
  }

  const better = alternatives.find(
    (candidate) =>
      candidate.routeId !== route?.routeId &&
      (candidate.conditionScore ?? 0) > (route?.conditionScore ?? 0) + 2,
  );
  if (better) {
    const extra = Math.max(
      0,
      Math.round((better.durationMinutes ?? 0) - (route?.durationMinutes ?? 0)),
    );
    warnings.push({
      id: "better-option",
      level: "info",
      title: `"${better.label}" scores ${better.conditionScore} vs ${route?.conditionScore}`,
      detail:
        extra > 0
          ? `It costs about ${extra} more minute${extra === 1 ? "" : "s"} of walking.`
          : "It takes about the same time.",
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      id: "clear",
      level: "clear",
      title: "No standout hazards on this route",
      detail:
        "No serious recent reports sit close to the path, and lighting coverage along it looks normal for the time of day.",
    });
  }

  return warnings;
}

/** Nearest staffed or familiar place a rider could divert to. */
export function nearestSafePlaces(places = [], location, limit = 3) {
  if (!Array.isArray(location) || location.length < 2) return [];
  return places
    .filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng))
    .map((place) => ({
      ...place,
      distanceMeters: Math.round(haversineMeters(location, [place.lat, place.lng])),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

/** Side-by-side rows for the route comparison table. */
export function compareRoutes(routes = [], incidents = []) {
  if (routes.length === 0) return [];
  const best = routes.reduce((a, b) =>
    (a.conditionScore ?? 0) >= (b.conditionScore ?? 0) ? a : b,
  );
  const fastest = routes.reduce((a, b) =>
    (a.durationMinutes ?? Infinity) <= (b.durationMinutes ?? Infinity) ? a : b,
  );

  return routes.map((route) => {
    const near = incidentsNearRoute(incidents, route, {
      withinMeters: 150,
      limit: 500,
    });
    return {
      routeId: route.routeId,
      label: route.label,
      conditionScore: route.conditionScore ?? 0,
      riskLevel: route.riskLevel,
      durationMinutes: route.durationMinutes ?? 0,
      distanceKm: route.distanceKm ?? 0,
      incidentsOnPath: near.length,
      seriousOnPath: near.filter((i) => SEVERE_CATEGORIES.has(i.category)).length,
      recommended: Boolean(route.recommended),
      isSafest: route.routeId === best.routeId,
      isFastest: route.routeId === fastest.routeId,
      minutesSlowerThanFastest: Math.max(
        0,
        Math.round((route.durationMinutes ?? 0) - (fastest.durationMinutes ?? 0)),
      ),
    };
  });
}

/** Counts by category for the "what's around here" summary. */
export function summarizeIncidents(incidents = []) {
  const byCategory = new Map();
  let lastWeek = 0;
  let serious = 0;

  for (const incident of incidents) {
    const key = incident.categoryLabel || incident.category || "Other";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    if ((incident.recencyDays ?? 999) <= 7) lastWeek += 1;
    if (SEVERE_CATEGORIES.has(incident.category)) serious += 1;
  }

  return {
    total: incidents.length,
    lastWeek,
    serious,
    categories: [...byCategory.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function isAfterDark(date = new Date()) {
  const hour = date.getHours();
  return hour >= 19 || hour < 6;
}

/**
 * Geocoders return the full postal chain — "Downtown Redmond, Northeast 76th
 * Street, Downtown Redmond, Redmond, King County, Washington, 98052, United
 * States". Only the leading parts identify the place to a person, and the rest
 * turns every card that shows a destination into a wall of text.
 */
export function shortPlaceName(name, parts = 2) {
  if (typeof name !== "string" || name.length === 0) return "";
  const segments = name
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    // A bare house number on its own ("Redmond Library, 15990") reads as noise;
    // it only means something attached to the street that follows it.
    .filter((segment) => !/^\d+$/.test(segment));
  if (segments.length <= parts) return segments.join(", ");
  return segments.slice(0, parts).join(", ");
}

/**
 * A one-line danger read for a route card: the worst thing near this path and
 * how close it is. Deliberately short — the card is a scan target, not a report.
 */
export function routeDangerSummary(route, incidents = []) {
  const near = incidentsNearRoute(incidents, route, {
    withinMeters: 250,
    limit: Number.MAX_SAFE_INTEGER,
  });

  if (near.length === 0) {
    return { level: "clear", text: "No recent reports within 250 m" };
  }

  const serious = near.filter((incident) => SEVERE_CATEGORIES.has(incident.category));
  const worst = (serious.length > 0 ? serious : near)[0];
  const label = (worst.categoryLabel || worst.description || "incident").toLowerCase();
  const others = near.length - 1;

  return {
    level: serious.length > 0 ? "high" : "medium",
    text:
      others > 0
        ? `${label}, ${worst.distanceMeters} m away · +${others} more nearby`
        : `${label}, ${worst.distanceMeters} m away`,
  };
}
