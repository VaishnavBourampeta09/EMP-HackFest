import { RoutingProviderError } from './errors.js';
import { decodePolyline, mergeLineCoordinates, pointsFromGeometry } from './geo.js';
import { fetchJson } from './http.js';

/**
 * Transit routing over Transitous (https://transitous.org), a free public MOTIS
 * deployment that aggregates community GTFS feeds — including King County Metro
 * and Sound Transit. It needs no API key, so transit works online out of the box
 * the same way Valhalla covers walking.
 *
 * A self-hosted OpenTripPlanner (OTP_URL) still takes priority when configured.
 */

const DEFAULT_BASE = 'https://api.transitous.org';

function planEndpoint() {
  const base = process.env.TRANSITOUS_URL || DEFAULT_BASE;
  return new URL('/api/v1/plan', base.endsWith('/') ? base : `${base}/`);
}

const WALK_MODES = new Set(['WALK']);

function legType(mode) {
  return WALK_MODES.has(String(mode).toUpperCase()) ? 'walking' : 'transit';
}

/** MOTIS reports mode as WALK / BUS / TRAM / SUBWAY / RAIL / FERRY … */
function friendlyMode(mode) {
  const value = String(mode || '').toUpperCase();
  if (value === 'TRAM') return 'Light rail';
  if (value === 'SUBWAY') return 'Subway';
  if (value === 'RAIL' || value === 'REGIONAL_RAIL' || value === 'LONG_DISTANCE') return 'Train';
  if (value === 'FERRY') return 'Ferry';
  if (value === 'BUS' || value === 'COACH') return 'Bus';
  return value ? value.charAt(0) + value.slice(1).toLowerCase() : 'Transit';
}

function legCoordinates(leg) {
  const encoded = leg?.legGeometry?.points;
  const precision = Number.isFinite(leg?.legGeometry?.precision)
    ? leg.legGeometry.precision
    : 5;
  if (typeof encoded === 'string' && encoded.length > 0) {
    const decoded = decodePolyline(encoded, precision);
    if (decoded.length > 1) return decoded;
  }

  // Fall back to a straight hop between the leg endpoints so the map still
  // draws something continuous.
  const from = leg?.from;
  const to = leg?.to;
  if (
    Number.isFinite(from?.lon) &&
    Number.isFinite(from?.lat) &&
    Number.isFinite(to?.lon) &&
    Number.isFinite(to?.lat)
  ) {
    return [
      [from.lon, from.lat],
      [to.lon, to.lat]
    ];
  }
  return [];
}

function minutesBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function normalizeLeg(leg, index, routeIndex) {
  const coordinates = legCoordinates(leg);
  const type = legType(leg.mode);
  const durationSeconds = Math.round(leg.duration || 0);
  const distanceMeters = Math.round(
    leg.distance ?? 0,
  );

  const routeName =
    leg.routeShortName || leg.routeLongName || leg.displayName || friendlyMode(leg.mode);

  return {
    legId: `transitous-${routeIndex}-leg-${index}`,
    type,
    mode: String(leg.mode || 'WALK').toUpperCase(),
    modeLabel: friendlyMode(leg.mode),
    from: leg.from?.name === 'START' ? 'Start' : leg.from?.name || 'Start',
    to: leg.to?.name === 'END' ? 'Destination' : leg.to?.name || 'Destination',
    durationSeconds,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    distanceMeters,
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    geometry: { type: 'LineString', coordinates },
    waypoints: coordinates.map(([lng, lat]) => [lat, lng]),
    steps: [],
    // Transit-only detail the UI can surface.
    routeName: type === 'transit' ? routeName : null,
    routeShortName: type === 'transit' ? routeName : null,
    routeColor: leg.routeColor ? `#${String(leg.routeColor).replace(/^#/, '')}` : null,
    agency: leg.agencyName ?? null,
    headsign: leg.headsign ?? null,
    scheduledStartTime: leg.scheduledStartTime ?? null,
    startTime: leg.startTime ?? null,
    endTime: leg.endTime ?? null,
    realTime: Boolean(leg.realTime),
    cancelled: Boolean(leg.cancelled),
    intermediateStopCount: Array.isArray(leg.intermediateStops)
      ? leg.intermediateStops.length
      : 0,
    wheelchairAccessible: leg.wheelchairAccessible ?? null
  };
}

/** Minutes spent waiting at a stop between the end of one leg and the next. */
function waitMinutes(legs) {
  let total = 0;
  for (let i = 1; i < legs.length; i += 1) {
    const previousEnd = legs[i - 1].endTime;
    const nextStart = legs[i].startTime;
    if (previousEnd && nextStart) total += minutesBetween(previousEnd, nextStart);
  }
  return total;
}

function normalizeItinerary(itinerary, routeIndex, origin, destination) {
  const sourceLegs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
  const legs = sourceLegs.map((leg, index) => normalizeLeg(leg, index, routeIndex));
  const transitLegs = legs.filter((leg) => leg.type === 'transit');
  const coordinates = mergeLineCoordinates(
    legs.map((leg) => leg.geometry.coordinates).filter((line) => line.length > 0)
  );
  const geometry = { type: 'LineString', coordinates };
  const durationSeconds = Math.round(itinerary.duration || 0);
  const distanceMeters = legs.reduce((total, leg) => total + leg.distanceMeters, 0);

  return {
    id: `transitous-transit-${routeIndex + 1}`,
    routeId: `transitous-transit-${routeIndex + 1}`,
    mode: 'transit',
    provider: 'transitous',
    origin,
    destination,
    durationSeconds,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    distanceMeters,
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    geometry,
    points: pointsFromGeometry(geometry),
    waypoints: pointsFromGeometry(geometry),
    legs,
    transitLegs,
    instructions: [],
    waitMinutes: waitMinutes(legs),
    transferCount: Number.isFinite(itinerary.transfers)
      ? itinerary.transfers
      : Math.max(0, transitLegs.length - 1),
    serviceDisruption: legs.some((leg) => leg.cancelled),
    departureTime: itinerary.startTime ?? null,
    arrivalTime: itinerary.endTime ?? null,
    realTime: legs.some((leg) => leg.realTime)
  };
}

export async function getTransitousRoutes(
  origin,
  destination,
  { maxCandidates = 3, departureTime } = {}
) {
  const url = planEndpoint();
  url.searchParams.set('fromPlace', `${origin.lat},${origin.lng}`);
  url.searchParams.set('toPlace', `${destination.lat},${destination.lng}`);
  url.searchParams.set('numItineraries', String(Math.max(1, maxCandidates)));
  if (departureTime) {
    url.searchParams.set('time', new Date(departureTime).toISOString());
  }

  // Transitous rejects generic user agents per its published usage policy.
  const contact =
    process.env.SENTINEL_CONTACT_EMAIL || process.env.SENTINEL_CONTACT_EMAIL;
  const payload = await fetchJson('Transitous', url, {
    timeoutMs: 20_000,
    headers: {
      'User-Agent': contact
        ? `Sentinel/0.1 (${contact})`
        : 'Sentinel/0.1 (safety routing prototype)'
    }
  });
  const itineraries = Array.isArray(payload?.itineraries) ? payload.itineraries : [];

  const withTransit = itineraries.filter((itinerary) =>
    (itinerary.legs || []).some((leg) => legType(leg.mode) === 'transit')
  );

  if (withTransit.length === 0) {
    throw new RoutingProviderError(
      'Transitous',
      'No scheduled transit itinerary was found right now. Try a walking route or check again later.'
    );
  }

  return withTransit
    .slice(0, maxCandidates)
    .map((itinerary, index) => normalizeItinerary(itinerary, index, origin, destination));
}
