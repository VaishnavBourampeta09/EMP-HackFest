import { RoutingProviderError } from './errors.js';
import { pointsFromGeometry } from './geo.js';
import { fetchJson } from './http.js';

function normalizeStep(step, index) {
  return {
    id: `mapbox-step-${index}`,
    instruction: step?.maneuver?.instruction || 'Continue',
    distanceMeters: Math.round(step?.distance || 0),
    durationSeconds: Math.round(step?.duration || 0),
    maneuver: step?.maneuver?.type,
    modifier: step?.maneuver?.modifier,
    streetName: step?.name || undefined,
    location: step?.maneuver?.location
      ? [step.maneuver.location[1], step.maneuver.location[0]]
      : undefined
  };
}

function normalizeRoute(route, index, origin, destination) {
  const geometry = route.geometry;
  const points = pointsFromGeometry(geometry);
  const legs = (route.legs || []).map((leg, legIndex) => {
    const steps = (leg.steps || []).map(normalizeStep);
    const legCoordinates = leg.steps?.flatMap((step) => step.geometry?.coordinates || []) || [];
    const legGeometry = {
      type: 'LineString',
      coordinates: legCoordinates.length ? legCoordinates : geometry.coordinates
    };

    return {
      legId: `mapbox-walk-${index}-leg-${legIndex}`,
      type: 'walking',
      mode: 'WALK',
      from: leg.summary || origin.name,
      to: destination.name,
      durationSeconds: Math.round(leg.duration || route.duration || 0),
      durationMinutes: Math.max(1, Math.round((leg.duration || route.duration || 0) / 60)),
      distanceMeters: Math.round(leg.distance || route.distance || 0),
      distanceKm: Number(((leg.distance || route.distance || 0) / 1000).toFixed(2)),
      geometry: legGeometry,
      waypoints: pointsFromGeometry(legGeometry),
      steps
    };
  });

  return {
    id: `mapbox-walk-${index + 1}`,
    routeId: `mapbox-walk-${index + 1}`,
    label: index === 0 ? 'Fastest walk' : `Walking alternative ${index + 1}`,
    mode: 'walking',
    provider: 'mapbox',
    origin,
    destination,
    durationSeconds: Math.round(route.duration || 0),
    durationMinutes: Math.max(1, Math.round((route.duration || 0) / 60)),
    distanceMeters: Math.round(route.distance || 0),
    distanceKm: Number(((route.distance || 0) / 1000).toFixed(2)),
    geometry,
    points,
    waypoints: points,
    legs,
    instructions: legs.flatMap((leg) => leg.steps),
    providerWeight: route.weight
  };
}

export async function getMapboxWalkingRoutes(origin, destination, { maxCandidates = 3 } = {}) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new RoutingProviderError('Mapbox Directions', 'MAPBOX_ACCESS_TOKEN is not configured.');
  }

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/walking/${encodeURIComponent(coordinates)}`
  );
  url.searchParams.set('access_token', token);
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('language', 'en');

  const payload = await fetchJson('Mapbox Directions', url);
  if (payload?.code !== 'Ok' || !payload?.routes?.length) {
    throw new RoutingProviderError(
      'Mapbox Directions',
      payload?.message || 'Mapbox did not find a walkable route.'
    );
  }

  return payload.routes
    .slice(0, maxCandidates)
    .map((route, index) => normalizeRoute(route, index, origin, destination));
}
