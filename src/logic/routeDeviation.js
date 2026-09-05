import { distanceToPathMeters, nearestIndex, pathLengthMeters } from './geo.js';

export function distanceFromRoute(location, routePoints) {
  return distanceToPathMeters(location, routePoints);
}

export function isOffRoute(location, routePoints, thresholdMeters = 300) {
  return distanceFromRoute(location, routePoints) > thresholdMeters;
}

export function routeProgress(location, routePoints) {
  if (!routePoints || routePoints.length < 2) return 0;
  const index = nearestIndex(location, routePoints);
  const travelled = pathLengthMeters(routePoints.slice(0, index + 1));
  const total = pathLengthMeters(routePoints);
  if (total === 0) return 0;
  return Math.min(1, travelled / total);
}

export function remainingMinutes(location, routePoints, durationMinutes) {
  const progress = routeProgress(location, routePoints);
  return Math.max(0, Math.round(durationMinutes * (1 - progress)));
}
