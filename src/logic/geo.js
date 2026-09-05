const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value) => (value * Math.PI) / 180;

export function haversineMeters(a, b) {
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceToSegmentMeters(point, start, end) {
  const scale = Math.cos(toRadians(point[0]));
  const px = point[1] * scale;
  const py = point[0];
  const ax = start[1] * scale;
  const ay = start[0];
  const bx = end[1] * scale;
  const by = end[0];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }
  const closest = [ay + t * dy, (ax + t * dx) / scale];
  return haversineMeters(point, closest);
}

export function distanceToPathMeters(point, path) {
  if (!path || path.length === 0) return Infinity;
  if (path.length === 1) return haversineMeters(point, path[0]);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const d = distanceToSegmentMeters(point, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function interpolatePath(waypoints, stepMeters = 60) {
  const points = [];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const segmentLength = haversineMeters(start, end);
    const steps = Math.max(1, Math.round(segmentLength / stepMeters));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      points.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
      ]);
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  return points;
}

export function pathLengthMeters(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += haversineMeters(path[i], path[i + 1]);
  }
  return total;
}

export function nearestIndex(point, path) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = haversineMeters(point, path[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
