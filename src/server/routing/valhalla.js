import { RoutingProviderError } from './errors.js';
import { decodePolyline, mergeLineCoordinates, pointsFromGeometry } from './geo.js';
import { fetchJson } from './http.js';

function routeEndpoint() {
  const base = process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de';
  return new URL('/route', base.endsWith('/') ? base : `${base}/`);
}

function valhallaMode(maneuver) {
  const rawMode = String(maneuver?.travel_mode || '').toLowerCase();
  if (rawMode === 'pedestrian') return 'WALK';
  if (rawMode === 'bicycle') return 'BICYCLE';
  if (rawMode === 'transit' || rawMode === 'public_transit') {
    return String(maneuver?.transit_info?.transit_type || 'TRANSIT').toUpperCase();
  }
  return rawMode ? rawMode.toUpperCase() : 'WALK';
}

function normalizeGeometry(shape) {
  if (shape?.type === 'LineString' && Array.isArray(shape.coordinates)) return shape;
  return {
    type: 'LineString',
    coordinates: decodePolyline(shape, 6)
  };
}

function normalizeStep(maneuver, index) {
  return {
    id: `valhalla-step-${index}`,
    instruction: maneuver.instruction || maneuver.verbal_pre_transition_instruction || 'Continue',
    distanceMeters: Math.round((maneuver.length || 0) * 1000),
    durationSeconds: Math.round(maneuver.time || 0),
    maneuver: maneuver.type,
    streetName: maneuver.street_names?.[0],
    beginShapeIndex: maneuver.begin_shape_index,
    endShapeIndex: maneuver.end_shape_index
  };
}

function splitLegByMode(leg, legIndex, routeIndex, fullCoordinates, origin, destination) {
  const maneuvers = leg.maneuvers || [];
  if (!maneuvers.length) {
    return [
      {
        legId: `valhalla-${routeIndex}-leg-${legIndex}`,
        type: 'walking',
        mode: 'WALK',
        from: origin.name,
        to: destination.name,
        durationSeconds: Math.round(leg.summary?.time || 0),
        durationMinutes: Math.max(1, Math.round((leg.summary?.time || 0) / 60)),
        distanceMeters: Math.round((leg.summary?.length || 0) * 1000),
        distanceKm: Number((leg.summary?.length || 0).toFixed(2)),
        geometry: { type: 'LineString', coordinates: fullCoordinates },
        waypoints: fullCoordinates.map(([lng, lat]) => [lat, lng]),
        steps: []
      }
    ];
  }

  const groups = [];
  for (const maneuver of maneuvers) {
    const mode = valhallaMode(maneuver);
    const previous = groups[groups.length - 1];
    if (previous?.mode === mode) previous.maneuvers.push(maneuver);
    else groups.push({ mode, maneuvers: [maneuver] });
  }

  return groups.map((group, groupIndex) => {
    const first = group.maneuvers[0];
    const last = group.maneuvers[group.maneuvers.length - 1];
    const startIndex = Math.max(0, first.begin_shape_index || 0);
    const endIndex = Math.max(startIndex + 1, last.end_shape_index || startIndex + 1);
    const coordinates = fullCoordinates.slice(startIndex, endIndex + 1);
    const transitInfo = group.maneuvers.find((item) => item.transit_info)?.transit_info;
    const isWalking = group.mode === 'WALK';
    const durationSeconds = group.maneuvers.reduce((sum, item) => sum + (item.time || 0), 0);
    const distanceKm = group.maneuvers.reduce((sum, item) => sum + (item.length || 0), 0);
    const fromName = transitInfo?.onestop_id || (groupIndex === 0 ? origin.name : 'Transfer point');
    const toName = groupIndex === groups.length - 1 ? destination.name : 'Transfer point';

    return {
      legId: `valhalla-${routeIndex}-leg-${legIndex}-${groupIndex}`,
      type: isWalking ? 'walking' : 'transit',
      mode: group.mode,
      from: fromName,
      to: toName,
      durationSeconds: Math.round(durationSeconds),
      durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
      distanceMeters: Math.round(distanceKm * 1000),
      distanceKm: Number(distanceKm.toFixed(2)),
      geometry: { type: 'LineString', coordinates },
      waypoints: coordinates.map(([lng, lat]) => [lat, lng]),
      steps: group.maneuvers.map(normalizeStep),
      routeShortName: transitInfo?.short_name,
      routeLongName: transitInfo?.long_name,
      headsign: transitInfo?.headsign,
      transitInfo
    };
  });
}

function normalizeTrip(trip, routeIndex, mode, origin, destination) {
  const sourceLegs = trip.legs || [];
  const sourceGeometries = sourceLegs.map((leg) => normalizeGeometry(leg.shape));
  const geometryCoordinates = mergeLineCoordinates(
    sourceGeometries.map((geometry) => geometry.coordinates)
  );
  const legs = sourceLegs.flatMap((leg, legIndex) =>
    splitLegByMode(
      leg,
      legIndex,
      routeIndex,
      sourceGeometries[legIndex].coordinates,
      origin,
      destination
    )
  );
  const summary = trip.summary || sourceLegs.reduce(
    (total, leg) => ({
      time: total.time + (leg.summary?.time || 0),
      length: total.length + (leg.summary?.length || 0)
    }),
    { time: 0, length: 0 }
  );
  const transitLegs = legs.filter((leg) => leg.type === 'transit');

  return {
    id: `valhalla-${mode}-${routeIndex + 1}`,
    routeId: `valhalla-${mode}-${routeIndex + 1}`,
    label:
      routeIndex === 0
        ? mode === 'transit'
          ? 'Best transit route'
          : 'Fastest walk'
        : `${mode === 'transit' ? 'Transit' : 'Walking'} alternative ${routeIndex + 1}`,
    mode,
    provider: 'valhalla',
    origin,
    destination,
    durationSeconds: Math.round(summary.time || 0),
    durationMinutes: Math.max(1, Math.round((summary.time || 0) / 60)),
    distanceMeters: Math.round((summary.length || 0) * 1000),
    distanceKm: Number((summary.length || 0).toFixed(2)),
    geometry: { type: 'LineString', coordinates: geometryCoordinates },
    points: pointsFromGeometry({ type: 'LineString', coordinates: geometryCoordinates }),
    waypoints: pointsFromGeometry({ type: 'LineString', coordinates: geometryCoordinates }),
    legs,
    transitLegs,
    instructions: legs.flatMap((leg) => leg.steps),
    waitMinutes: 0,
    transferCount: Math.max(0, transitLegs.length - 1),
    serviceDisruption: false
  };
}

export async function getValhallaRoutes(
  origin,
  destination,
  { mode = 'walking', maxCandidates = 3, departureTime } = {}
) {
  const isTransit = mode === 'transit';
  const request = {
    locations: [
      { lat: origin.lat, lon: origin.lng, type: 'break' },
      { lat: destination.lat, lon: destination.lng, type: 'break' }
    ],
    costing: isTransit ? 'multimodal' : 'pedestrian',
    units: 'kilometers',
    language: 'en-US',
    alternates: Math.max(0, maxCandidates - 1),
    directions_options: { units: 'kilometers', language: 'en-US' }
  };

  if (isTransit) {
    request.date_time = {
      type: 1,
      value: new Date(departureTime || Date.now()).toISOString().slice(0, 16)
    };
  }

  const payload = await fetchJson('Valhalla', routeEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  const trips = [payload?.trip, ...(payload?.alternates || []).map((item) => item.trip)].filter(Boolean);

  if (!trips.length || payload?.trip?.status) {
    throw new RoutingProviderError(
      'Valhalla',
      payload?.trip?.status_message || payload?.error || 'Valhalla did not find a route.'
    );
  }

  const routes = trips
    .slice(0, maxCandidates)
    .map((trip, index) => normalizeTrip(trip, index, mode, origin, destination));

  if (isTransit && !routes.some((route) => route.transitLegs.length)) {
    throw new RoutingProviderError(
      'Valhalla',
      'The public fallback has no transit itinerary for these points. Configure OTP_URL for local transit coverage.'
    );
  }

  return routes;
}
