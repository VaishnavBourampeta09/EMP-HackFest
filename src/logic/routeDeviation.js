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

/**
 * Minutes still to travel.
 *
 * Scaling the whole trip by distance covered is only right when the pace is
 * constant. On a mixed walk/bus journey the bus eats distance far faster than
 * the walking legs, so a distance-proportional ETA is badly wrong mid-trip.
 * When per-leg durations are available this walks the legs instead, then
 * rescales so the figure still agrees with the route's headline duration.
 */
export function remainingMinutes(location, routePoints, durationMinutes, legs = null) {
  // Providers name the leg geometry `waypoints`; only the route itself has
  // `points`. Accept either so this works for both shapes.
  const usableLegs = Array.isArray(legs)
    ? legs
        .map((leg) => ({
          durationMinutes: leg.durationMinutes,
          points: Array.isArray(leg.points) && leg.points.length > 1
            ? leg.points
            : leg.waypoints
        }))
        .filter(
          (leg) =>
            Array.isArray(leg.points) &&
            leg.points.length > 1 &&
            Number.isFinite(leg.durationMinutes)
        )
    : [];

  if (usableLegs.length === 0) {
    const progress = routeProgress(location, routePoints);
    return Math.max(0, Math.round((durationMinutes || 0) * (1 - progress)));
  }

  let legIndex = 0;
  let closest = Infinity;
  usableLegs.forEach((leg, index) => {
    const distance = distanceToPathMeters(location, leg.points);
    if (distance < closest) {
      closest = distance;
      legIndex = index;
    }
  });

  const current = usableLegs[legIndex];
  let remaining = current.durationMinutes * (1 - routeProgress(location, current.points));
  for (let i = legIndex + 1; i < usableLegs.length; i += 1) {
    remaining += usableLegs[i].durationMinutes;
  }

  // Legs can omit waiting time, so keep the ETA consistent with the total the
  // rest of the UI shows.
  const legTotal = usableLegs.reduce((total, leg) => total + leg.durationMinutes, 0);
  if (legTotal > 0 && Number.isFinite(durationMinutes) && durationMinutes > 0) {
    remaining *= durationMinutes / legTotal;
  }

  return Math.max(0, Math.round(remaining));
}
