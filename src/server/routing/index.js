import { RoutingInputError, RoutingProviderError } from './errors.js';
import { clampCandidateCount, normalizeIsoDate } from './geo.js';
import { resolvePlace } from './geocode.js';
import { getMapboxWalkingRoutes } from './mapbox.js';
import { getOtpTransitRoutes } from './otp.js';
import { getTransitousRoutes } from './transitous.js';
import { getValhallaRoutes } from './valhalla.js';

function publicFallbackAllowed(value) {
  if (process.env.ROUTING_ALLOW_PUBLIC_FALLBACK === 'false') return false;
  return value !== false;
}

function providerFailure(error) {
  return {
    provider: error?.provider || 'unknown',
    message: error?.message || 'Provider failed'
  };
}

function assertDistinctPlaces(origin, destination) {
  if (origin.lat === destination.lat && origin.lng === destination.lng) {
    throw new RoutingInputError('Origin and destination must be different points.');
  }
}

export function routingCapabilities() {
  const publicFallback = publicFallbackAllowed();
  return {
    geocoding: {
      configured: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
      preferredProvider: process.env.MAPBOX_ACCESS_TOKEN ? 'mapbox' : 'nominatim',
      publicFallback
    },
    walking: {
      configured: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
      preferredProvider: process.env.MAPBOX_ACCESS_TOKEN ? 'mapbox' : 'valhalla',
      publicFallback
    },
    transit: {
      configured: true,
      preferredProvider: process.env.OTP_URL ? 'opentripplanner' : 'transitous',
      publicFallback,
      note: process.env.OTP_URL
        ? 'OTP GTFS GraphQL is enabled.'
        : 'Live schedules via Transitous (King County Metro + Sound Transit GTFS).'
    }
  };
}

async function walkingRoutes(origin, destination, options) {
  const attempts = [];
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    try {
      return {
        routes: await getMapboxWalkingRoutes(origin, destination, options),
        attempts,
        fallbackUsed: false
      };
    } catch (error) {
      attempts.push(providerFailure(error));
      if (!options.allowPublicFallback) throw error;
    }
  }

  if (!options.allowPublicFallback) {
    throw new RoutingProviderError(
      'Walking routing',
      'MAPBOX_ACCESS_TOKEN is required when public routing fallback is disabled.',
      { details: { attempts } }
    );
  }

  try {
    return {
      routes: await getValhallaRoutes(origin, destination, options),
      attempts,
      fallbackUsed: Boolean(process.env.MAPBOX_ACCESS_TOKEN)
    };
  } catch (error) {
    attempts.push(providerFailure(error));
    throw new RoutingProviderError(
      'Walking routing',
      'No walking provider could plan this trip.',
      { cause: error, details: { attempts } }
    );
  }
}

async function transitRoutes(origin, destination, options) {
  const attempts = [];
  if (process.env.OTP_URL) {
    try {
      return {
        routes: await getOtpTransitRoutes(origin, destination, options),
        attempts,
        fallbackUsed: false
      };
    } catch (error) {
      attempts.push(providerFailure(error));
      if (!options.allowPublicFallback) throw error;
    }
  }

  if (!options.allowPublicFallback) {
    throw new RoutingProviderError(
      'Transit routing',
      'OTP_URL is required when public routing fallback is disabled.',
      { details: { attempts } }
    );
  }

  // Transitous is a free public MOTIS service carrying King County Metro and
  // Sound Transit GTFS, so transit works online without any local server.
  try {
    return {
      routes: await getTransitousRoutes(origin, destination, options),
      attempts,
      fallbackUsed: Boolean(process.env.OTP_URL)
    };
  } catch (error) {
    attempts.push(providerFailure(error));
  }

  // Last resort: Valhalla multimodal, which only sometimes has transit tiles.
  try {
    return {
      routes: await getValhallaRoutes(origin, destination, options),
      attempts,
      fallbackUsed: true
    };
  } catch (error) {
    attempts.push(providerFailure(error));
    throw new RoutingProviderError(
      'Transit routing',
      'No scheduled transit itinerary was found for this trip and time. Try a different departure time, or a walking route.',
      { cause: error, details: { attempts } }
    );
  }
}

export async function planPointToPoint({
  origin: originInput,
  destination: destinationInput,
  mode = 'walking',
  departureTime = new Date(),
  maxCandidates = 3,
  language = 'en',
  allowPublicFallback: requestedFallback
} = {}) {
  if (originInput === undefined || destinationInput === undefined) {
    throw new RoutingInputError('Both origin and destination are required.');
  }

  const normalizedMode = String(mode).toLowerCase();
  if (!['walking', 'transit'].includes(normalizedMode)) {
    throw new RoutingInputError('mode must be either “walking” or “transit”.', { field: 'mode' });
  }

  const allowPublicFallback = publicFallbackAllowed(requestedFallback);
  const [origin, destination] = await Promise.all([
    resolvePlace(originInput, { language, allowPublicFallback }),
    resolvePlace(destinationInput, { language, allowPublicFallback })
  ]);
  assertDistinctPlaces(origin, destination);

  const options = {
    mode: normalizedMode,
    departureTime: normalizeIsoDate(departureTime),
    maxCandidates: clampCandidateCount(maxCandidates),
    allowPublicFallback
  };
  const result = normalizedMode === 'transit'
    ? await transitRoutes(origin, destination, options)
    : await walkingRoutes(origin, destination, options);

  return {
    origin,
    destination,
    mode: normalizedMode,
    routes: result.routes,
    metadata: {
      provider: result.routes[0]?.provider,
      fallbackUsed: result.fallbackUsed,
      attempts: result.attempts,
      generatedAt: new Date().toISOString(),
      attribution: Array.from(
        new Set(
          [
            origin.attribution,
            destination.attribution,
            result.routes[0]?.provider === 'mapbox' ? '© Mapbox and its data suppliers' : null,
            result.routes[0]?.provider === 'valhalla' ? 'Routing © Valhalla; data © OpenStreetMap contributors' : null,
            result.routes[0]?.provider === 'transitous' ? 'Transit © Transitous / MOTIS; schedules © King County Metro and Sound Transit' : null
          ].filter(Boolean)
        )
      )
    }
  };
}

export { resolvePlace, searchPlaces } from './geocode.js';
export { publicRoutingError, RoutingError, RoutingInputError, RoutingProviderError } from './errors.js';
