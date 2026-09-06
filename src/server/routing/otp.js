import { RoutingProviderError } from './errors.js';
import { decodePolyline, mergeLineCoordinates, normalizeIsoDate } from './geo.js';
import { fetchJson } from './http.js';

const ITINERARY_FIELDS = `
  start
  end
  duration
  waitingTime
  walkDistance
  numberOfTransfers
  legs {
    mode
    transitLeg
    duration
    distance
    startTime
    endTime
    departureDelay
    arrivalDelay
    realTime
    from { name lat lon }
    to { name lat lon }
    headsign
    legGeometry { points }
    route { gtfsId shortName longName color mode }
    steps {
      absoluteDirection
      relativeDirection
      distance
      lat
      lon
      streetName
    }
    alerts { alertHeaderText alertEffect alertSeverityLevel }
  }
`;

const PLAN_CONNECTION_QUERY = `
  query SentinelPlanConnection(
    $origin: PlanLabeledLocationInput!
    $destination: PlanLabeledLocationInput!
    $dateTime: PlanDateTimeInput
    $first: Int
  ) {
    planConnection(
      origin: $origin
      destination: $destination
      dateTime: $dateTime
      first: $first
      modes: { transitOnly: true }
    ) {
      routingErrors { code description inputField }
      edges { node { ${ITINERARY_FIELDS} } }
    }
  }
`;

const LEGACY_PLAN_QUERY = `
  query SentinelLegacyPlan(
    $from: InputCoordinates!
    $to: InputCoordinates!
    $date: String
    $time: String
    $numItineraries: Int
  ) {
    plan(
      from: $from
      to: $to
      date: $date
      time: $time
      numItineraries: $numItineraries
    ) {
      messageStrings
      routingErrors { code description inputField }
      itineraries { ${ITINERARY_FIELDS} }
    }
  }
`;

function graphqlEndpoint() {
  const configured = process.env.OTP_URL;
  if (!configured) {
    throw new RoutingProviderError('OpenTripPlanner', 'OTP_URL is not configured.');
  }

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new RoutingProviderError(
      'OpenTripPlanner',
      'OTP_URL must be a valid absolute URL.'
    );
  }
  const cleanPath = url.pathname.replace(/\/$/, '');
  const alreadyGraphql =
    cleanPath.includes('/gtfs/') ||
    cleanPath.includes('/transmodel/') ||
    cleanPath.endsWith('/graphql');
  if (!alreadyGraphql) {
    url.pathname = `${cleanPath === '/otp' ? '/otp' : cleanPath}/otp/gtfs/v1`.replace(
      '/otp/otp/',
      '/otp/'
    );
  }
  return url;
}

async function postGraphql(query, variables, operationName) {
  const payload = await fetchJson('OpenTripPlanner', graphqlEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
      OTPTimeout: '15000'
    },
    body: JSON.stringify({ query, variables, operationName }),
    timeoutMs: 18_000
  });

  if (payload?.errors?.length) {
    throw new RoutingProviderError(
      'OpenTripPlanner',
      payload.errors.map((error) => error.message).join('; '),
      { details: { graphqlErrors: payload.errors.map((error) => error.message) } }
    );
  }
  return payload?.data;
}

function asMilliseconds(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function walkingInstruction(step) {
  const direction = String(step.relativeDirection || step.absoluteDirection || 'continue')
    .toLowerCase()
    .replaceAll('_', ' ');
  const street = step.streetName ? ` on ${step.streetName}` : '';
  return `${direction.charAt(0).toUpperCase()}${direction.slice(1)}${street}`;
}

function normalizeLeg(leg, routeIndex, legIndex, origin, destination) {
  const decodedCoordinates = leg.legGeometry?.points
    ? decodePolyline(leg.legGeometry.points, 5)
    : [];
  const coordinates = decodedCoordinates.length
    ? decodedCoordinates
    : [
        [leg.from?.lon, leg.from?.lat],
        [leg.to?.lon, leg.to?.lat]
      ].filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  const isTransit = Boolean(leg.transitLeg);
  const routeName = leg.route?.shortName || leg.route?.longName || leg.mode;
  const steps = isTransit
    ? [
        {
          id: `otp-${routeIndex}-leg-${legIndex}-board`,
          instruction: `Take ${routeName}${leg.headsign ? ` toward ${leg.headsign}` : ''} from ${leg.from?.name || 'the stop'} to ${leg.to?.name || 'your stop'}.`,
          distanceMeters: Math.round(leg.distance || 0),
          durationSeconds: Math.round(leg.duration || 0),
          maneuver: 'BOARD_TRANSIT',
          location: leg.from ? [leg.from.lat, leg.from.lon] : undefined
        }
      ]
    : (leg.steps || []).map((step, stepIndex) => ({
        id: `otp-${routeIndex}-leg-${legIndex}-step-${stepIndex}`,
        instruction: walkingInstruction(step),
        distanceMeters: Math.round(step.distance || 0),
        maneuver: step.relativeDirection || step.absoluteDirection,
        streetName: step.streetName || undefined,
        location: Number.isFinite(step.lat) && Number.isFinite(step.lon)
          ? [step.lat, step.lon]
          : undefined
      }));
  const serviceAlerts = (leg.alerts || []).map((alert) => ({
    title: alert.alertHeaderText || 'Transit service alert',
    effect: alert.alertEffect,
    severity: alert.alertSeverityLevel
  }));
  const startTime = asMilliseconds(leg.startTime);
  const endTime = asMilliseconds(leg.endTime);

  return {
    legId: `otp-${routeIndex}-leg-${legIndex}`,
    type: isTransit ? 'transit' : 'walking',
    mode: String(leg.mode || (isTransit ? 'TRANSIT' : 'WALK')).toUpperCase(),
    from: leg.from?.name || (legIndex === 0 ? origin.name : 'Transfer point'),
    to: leg.to?.name || destination.name,
    fromCoordinate: leg.from ? [leg.from.lat, leg.from.lon] : undefined,
    toCoordinate: leg.to ? [leg.to.lat, leg.to.lon] : undefined,
    durationSeconds: Math.round(leg.duration || 0),
    durationMinutes: Math.max(1, Math.round((leg.duration || 0) / 60)),
    distanceMeters: Math.round(leg.distance || 0),
    distanceKm: Number(((leg.distance || 0) / 1000).toFixed(2)),
    geometry: { type: 'LineString', coordinates },
    waypoints: coordinates.map(([lng, lat]) => [lat, lng]),
    steps,
    startTime,
    endTime,
    routeId: leg.route?.gtfsId,
    routeShortName: leg.route?.shortName,
    routeLongName: leg.route?.longName,
    routeColor: leg.route?.color ? `#${leg.route.color.replace('#', '')}` : undefined,
    headsign: leg.headsign,
    realTime: Boolean(leg.realTime),
    departureDelaySeconds: leg.departureDelay || 0,
    arrivalDelaySeconds: leg.arrivalDelay || 0,
    serviceAlerts
  };
}

function normalizeItinerary(itinerary, routeIndex, origin, destination) {
  const legs = (itinerary.legs || []).map((leg, legIndex) =>
    normalizeLeg(leg, routeIndex, legIndex, origin, destination)
  );
  const coordinates = mergeLineCoordinates(legs.map((leg) => leg.geometry.coordinates));
  const transitLegs = legs.filter((leg) => leg.type === 'transit');
  const serviceAlerts = transitLegs.flatMap((leg) => leg.serviceAlerts);
  const startTime = asMilliseconds(itinerary.start) || legs[0]?.startTime;
  const endTime = asMilliseconds(itinerary.end) || legs[legs.length - 1]?.endTime;

  return {
    id: `otp-transit-${routeIndex + 1}`,
    routeId: `otp-transit-${routeIndex + 1}`,
    mode: 'transit',
    provider: 'opentripplanner',
    origin,
    destination,
    durationSeconds: Math.round(itinerary.duration || 0),
    durationMinutes: Math.max(1, Math.round((itinerary.duration || 0) / 60)),
    distanceMeters: Math.round(
      legs.reduce((sum, leg) => sum + (leg.distanceMeters || 0), 0)
    ),
    distanceKm: Number(
      (legs.reduce((sum, leg) => sum + (leg.distanceMeters || 0), 0) / 1000).toFixed(2)
    ),
    geometry: { type: 'LineString', coordinates },
    points: coordinates.map(([lng, lat]) => [lat, lng]),
    waypoints: coordinates.map(([lng, lat]) => [lat, lng]),
    legs,
    transitLegs,
    instructions: legs.flatMap((leg) => leg.steps),
    waitMinutes: Math.max(0, Math.round((itinerary.waitingTime || 0) / 60)),
    transferCount: itinerary.numberOfTransfers ?? Math.max(0, transitLegs.length - 1),
    walkDistanceMeters: Math.round(itinerary.walkDistance || 0),
    startTime,
    endTime,
    serviceAlerts,
    serviceDisruption: serviceAlerts.length > 0,
    realtime: transitLegs.some((leg) => leg.realTime)
  };
}

async function requestPlanConnection(origin, destination, departureTime, maxCandidates) {
  const data = await postGraphql(
    PLAN_CONNECTION_QUERY,
    {
      origin: {
        label: origin.name,
        location: { coordinate: { latitude: origin.lat, longitude: origin.lng } }
      },
      destination: {
        label: destination.name,
        location: { coordinate: { latitude: destination.lat, longitude: destination.lng } }
      },
      dateTime: { earliestDeparture: departureTime },
      first: maxCandidates
    },
    'SentinelPlanConnection'
  );
  const errors = data?.planConnection?.routingErrors || [];
  const itineraries = (data?.planConnection?.edges || []).map((edge) => edge.node).filter(Boolean);
  return { errors, itineraries };
}

async function requestLegacyPlan(origin, destination, departureTime, maxCandidates) {
  const date = new Date(departureTime);
  const data = await postGraphql(
    LEGACY_PLAN_QUERY,
    {
      from: { lat: origin.lat, lon: origin.lng, address: origin.name },
      to: { lat: destination.lat, lon: destination.lng, address: destination.name },
      date: date.toISOString().slice(0, 10),
      time: date.toISOString().slice(11, 16),
      numItineraries: maxCandidates
    },
    'SentinelLegacyPlan'
  );
  return {
    errors: data?.plan?.routingErrors || data?.plan?.messageStrings || [],
    itineraries: data?.plan?.itineraries || []
  };
}

export async function getOtpTransitRoutes(
  origin,
  destination,
  { departureTime = new Date(), maxCandidates = 3 } = {}
) {
  const isoDeparture = normalizeIsoDate(departureTime);
  let response;

  try {
    response = await requestPlanConnection(origin, destination, isoDeparture, maxCandidates);
  } catch (error) {
    if (!error?.details?.graphqlErrors) throw error;
    response = await requestLegacyPlan(origin, destination, isoDeparture, maxCandidates);
  }

  if (!response.itineraries.length) {
    const details = response.errors.map((error) => error.description || error.code || String(error));
    throw new RoutingProviderError(
      'OpenTripPlanner',
      details[0] || 'OpenTripPlanner did not find a transit itinerary.',
      { details: { routingErrors: details } }
    );
  }

  const routes = response.itineraries
    .slice(0, maxCandidates)
    .map((itinerary, index) => normalizeItinerary(itinerary, index, origin, destination))
    .filter((route) => route.transitLegs.length > 0);

  if (!routes.length) {
    throw new RoutingProviderError(
      'OpenTripPlanner',
      'OpenTripPlanner returned no itinerary containing a transit leg.'
    );
  }

  return routes;
}
