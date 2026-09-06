import { distanceToPathMeters, haversineMeters } from './GEO.JS';

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
    .filter(
      (incident) =>
        Number.isFinite(incident?.lat) && Number.isFinite(incident?.lng),
    )
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

/** Events that deserve an on-map warning, rather than background context. */
export function isRiskyIncident(incident) {
  return (
    SEVERE_CATEGORIES.has(incident?.category) ||
    Number(incident?.severity ?? 0) >= 4
  );
}

/** Nearest staffed or familiar place a rider could divert to. */
export function nearestSafePlaces(places = [], location, limit = 3) {
  if (!Array.isArray(location) || location.length < 2) return [];
  return places
    .filter(
      (place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng),
    )
    .map((place) => ({
      ...place,
      distanceMeters: Math.round(
        haversineMeters(location, [place.lat, place.lng]),
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
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
    if (isRiskyIncident(incident)) serious += 1;
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

  const serious = near.filter((incident) =>
    SEVERE_CATEGORIES.has(incident.category),
  );
  const worst = (serious.length > 0 ? serious : near)[0];
  const label = worst.categoryLabel || worst.description || "incident";
  const others = near.length - 1;

  return {
    level: serious.length > 0 ? "high" : "medium",
    text:
      others > 0
        ? `${label}, ${worst.distanceMeters} m away`
        : `${label}, ${worst.distanceMeters} m away`,
  };
}
