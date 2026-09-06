import { RoutingProviderError } from './errors.js';
import { decodePolyline, mergeLineCoordinates, pointsFromGeometry } from './geo.js';
import { fetchJson } from './http.js';
import { distanceToPathMeters, haversineMeters } from '../../logic/geo.js';
import { samplePath } from '../../logic/safetyScoring.js';

// Single-process MVP limiter, shared by all pedestrian requests in this process.
let nextRequestAt = 0;
async function waitForSlot() {
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + 1000;
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}

function normalizeTrip(trip, index, origin, destination) {
  const legs = (trip.legs || []).map((leg, legIndex) => {
    const geometry = leg.shape?.type === 'LineString' ? leg.shape
      : { type: 'LineString', coordinates: decodePolyline(leg.shape, 6) };
    const steps = (leg.maneuvers || []).map((step, stepIndex) => ({
      id: `valhalla-step-${legIndex}-${stepIndex}`,
      instruction: step.instruction || 'Continue',
      distanceMeters: Math.round((step.length || 0) * 1000),
      durationSeconds: Math.round(step.time || 0),
      maneuver: step.type, streetName: step.street_names?.[0],
      beginShapeIndex: step.begin_shape_index, endShapeIndex: step.end_shape_index,
    }));
    return {
      legId: `valhalla-${index}-leg-${legIndex}`, type: 'walking', mode: 'WALK',
      from: origin.name, to: destination.name,
      durationSeconds: Math.round(leg.summary?.time || 0),
      durationMinutes: Math.max(1, Math.round((leg.summary?.time || 0) / 60)),
      distanceMeters: Math.round((leg.summary?.length || 0) * 1000),
      distanceKm: Number((leg.summary?.length || 0).toFixed(2)),
      geometry, waypoints: pointsFromGeometry(geometry), steps,
    };
  });
  const geometry = { type: 'LineString', coordinates: mergeLineCoordinates(legs.map(leg => leg.geometry.coordinates)) };
  const points = pointsFromGeometry(geometry);
  if (points.length < 2) throw new RoutingProviderError('Valhalla', 'No walkable route geometry was returned.');
  return {
    id: `valhalla-walking-${index + 1}`, routeId: `valhalla-walking-${index + 1}`,
    label: `Route ${String.fromCharCode(65 + index)}`, mode: 'walking', provider: 'valhalla',
    origin, destination,
    durationSeconds: Math.round(trip.summary?.time || 0),
    durationMinutes: Math.max(1, Math.round((trip.summary?.time || 0) / 60)),
    distanceMeters: Math.round((trip.summary?.length || 0) * 1000),
    distanceKm: Number((trip.summary?.length || 0).toFixed(2)),
    geometry, points, waypoints: points, legs, transitLegs: [], instructions: legs.flatMap(leg => leg.steps),
  };
}

async function requestWalkingTrips(origin, destination, waypoint = null) {
  await waitForSlot();
  const payload = await fetchJson('Valhalla',
    new URL('/route', process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': process.env.VALHALLA_CLIENT_ID || 'sentinel-hackfest' },
      body: JSON.stringify({
        locations: [
          { lat: origin.lat, lon: origin.lng, type: 'break' },
          ...(waypoint ? [{ ...waypoint, type: 'through' }] : []),
          { lat: destination.lat, lon: destination.lng, type: 'break' },
        ],
        costing: 'pedestrian', alternates: waypoint ? 0 : 2,
        directions_options: { units: 'kilometers', language: 'en-US' },
      }),
    });
  if (payload?.trip?.status || (!payload?.trip && !(payload?.alternates || []).length)) {
    throw new RoutingProviderError('Valhalla', payload?.error || 'No walking route found.');
  }
  return [payload?.trip, ...(payload?.alternates || []).map(item => item.trip)].filter(Boolean);
}

function overlap(a, b) {
  const samples = samplePath(a.points);
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  return total ? samples.reduce((sum, sample) => sum +
    (distanceToPathMeters(sample.point, b.points) <= 30 ? sample.weight : 0), 0) / total : 1;
}

export async function getValhallaRoutes(origin, destination, { maxCandidates = 3 } = {}) {
  const limit = Math.max(1, Math.min(3, maxCandidates));
  const trips = await requestWalkingTrips(origin, destination);
  const baseline = normalizeTrip(trips[0], 0, origin, destination);
  const routes = [baseline];
  function add(trip) {
    const route = normalizeTrip(trip, routes.length, origin, destination);
    if (routes.length >= limit || route.durationSeconds > baseline.durationSeconds * 1.8) return;
    if (routes.some(other => overlap(route, other) >= 0.7 && overlap(other, route) >= 0.7)) return;
    routes.push(route);
  }
  trips.slice(1).forEach(add);

  // Route through opposite sides of the trip corridor. These are shaping
  // points, not safe-place claims or extra passenger stops.
  const samples = samplePath(baseline.points);
  const center = samples[Math.floor(samples.length / 2)]?.point;
  const latScale = 111320;
  const lngScale = latScale * Math.cos((origin.lat + destination.lat) / 2 * Math.PI / 180);
  const dx = (destination.lng - origin.lng) * lngScale;
  const dy = (destination.lat - origin.lat) * latScale;
  const length = Math.hypot(dx, dy);
  const offset = Math.min(350, Math.max(150, length * 0.3));
  for (const side of [-1, 1]) {
    if (routes.length >= limit || !center || length < 100) break;
    const waypoint = { lat: center[0] + side * dx / length * offset / latScale,
      lon: center[1] - side * dy / length * offset / lngScale };
    if (waypoint.lat < 47.62 || waypoint.lat > 47.76 || waypoint.lon < -122.24 || waypoint.lon > -122.05) continue;
    if (haversineMeters([waypoint.lat, waypoint.lon], [origin.lat, origin.lng]) < 100 ||
      haversineMeters([waypoint.lat, waypoint.lon], [destination.lat, destination.lng]) < 100) continue;
    try {
      (await requestWalkingTrips(origin, destination, waypoint)).forEach(add);
    } catch {
      // A river, disconnected path, or unavailable provider can prevent a detour.
      // Keep the successful routes; never fabricate a third option.
    }
  }
  return routes;
}
