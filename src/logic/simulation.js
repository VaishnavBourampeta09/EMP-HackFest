/**
 * A path running parallel to the route, bulging away at the midpoint. Used by
 * the demo to fake a sustained detour that the trip monitor can actually detect.
 */
export function buildDeviationPath(points = []) {
  if (points.length < 2) return points;
  return points.map(([lat, lng], index) => {
    const progress = index / Math.max(1, points.length - 1);
    const deviation = Math.sin(progress * Math.PI) * 0.0032;
    return [lat + deviation * 0.72, lng + deviation];
  });
}
