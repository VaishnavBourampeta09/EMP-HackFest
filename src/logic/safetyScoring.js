import { distanceToPathMeters, haversineMeters, pathLengthMeters } from './geo.js';

export const INCIDENT_POINTS_PER_INCIDENT_PER_KM = 0.03;
export const INCIDENT_CORRIDOR_METERS = 100;

export function walkingPaths(route) {
  if (route.mode !== 'transit') return [route.points || route.waypoints || []];
  return (route.legs || []).filter(leg => ['walk', 'walking'].includes(String(leg.type || leg.mode).toLowerCase()))
    .map(leg => leg.points || leg.waypoints || leg.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || []);
}

// Equal-distance midpoint samples, independent of the provider's vertex density.
export function samplePath(path) {
  const length = pathLengthMeters(path);
  if (!length) return [];
  const count = Math.ceil(length / 25);
  const step = length / count;
  const result = [];
  let edge = 1, traversed = 0;
  for (let index = 0; index < count; index++) {
    const target = (index + 0.5) * step;
    while (edge < path.length - 1 && traversed + haversineMeters(path[edge - 1], path[edge]) < target) {
      traversed += haversineMeters(path[edge - 1], path[edge]);
      edge++;
    }
    const a = path[edge - 1], b = path[edge];
    const fraction = (target - traversed) / (haversineMeters(a, b) || 1);
    result.push({ point: [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction], weight: step });
  }
  return result;
}

export function scoreSafety(route, incidents = [], segments = [], safetyMode = 'day') {
  const paths = walkingPaths(route).filter(path => path.length > 1);
  const lengthKm = paths.reduce((sum, path) => sum + pathLengthMeters(path), 0) / 1000;
  const seen = new Set();
  for (const incident of incidents) {
    if (paths.some(path => distanceToPathMeters([incident.lat, incident.lng], path) <= INCIDENT_CORRIDOR_METERS)) seen.add(incident.id ?? incident);
  }
  const incidentCount = seen.size;
  const density = lengthKm > 0 ? incidentCount / lengthKm : null;
  let known = 0, unlit = 0, total = 0;
  for (const { point, weight } of paths.flatMap(samplePath)) {
    total += weight;
    let nearest = null, distance = 20;
    for (const segment of segments) {
      if (!['yes', 'no'].includes(segment.lit)) continue;
      const gap = distanceToPathMeters(point, segment.points);
      if (gap < distance) { nearest = segment; distance = gap; }
    }
    if (nearest) { known += weight; if (nearest.lit === 'no') unlit += weight; }
  }
  const lightingDataAvailable = total > 0 && known >= total / 2;
  const unlitPercent = lightingDataAvailable ? Math.round(100 * unlit / known) : null;
  const incidentPoints = density === null ? null : Math.max(0, 10 - INCIDENT_POINTS_PER_INCIDENT_PER_KM * density);
  const score = incidentPoints === null ? null : safetyMode === 'night'
    ? incidentPoints / 2 + (lightingDataAvailable ? 5 * (1 - unlit / known) : 2.5)
    : incidentPoints;
  return { safetyMode, safetyScore: score === null ? null : Number(score.toFixed(1)), incidentCount,
    incidentsPerKm: density === null ? null : Number(density.toFixed(2)), unlitPercent, lightingDataAvailable };
}

export function rankSafety(routes) {
  const fastest = Math.min(...routes.map(route => route.durationMinutes));
  return [...routes].sort((a, b) => (b.safetyScore ?? -1) - (a.safetyScore ?? -1) || a.durationMinutes - b.durationMinutes)
    .map((route, index) => ({ ...route, label: `Route ${String.fromCharCode(65 + index)}`, rank: index + 1,
      recommended: index === 0 && route.safetyScore !== null, timeDeltaMinutes: route.durationMinutes - fastest }));
}
