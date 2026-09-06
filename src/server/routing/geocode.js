import { RoutingInputError, RoutingProviderError } from './errors.js';
import { coordinateFromInput, placeFromCoordinate } from './geo.js';
import { fetchJson } from './http.js';

const PUBLIC_NOMINATIM_MIN_INTERVAL_MS = 1_050;
const CACHE_TTL_MS = 60 * 60 * 1000;
const geocodeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function normalizedQuery(input) {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') {
    return String(input.query ?? input.address ?? input.name ?? '').trim();
  }
  return '';
}

function cacheKey(provider, query, limit) {
  return `${provider}:${limit}:${query.toLocaleLowerCase()}`;
}

function readCache(key) {
  const cached = geocodeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key, value) {
  geocodeCache.set(key, { createdAt: Date.now(), value });
  if (geocodeCache.size > 200) geocodeCache.delete(geocodeCache.keys().next().value);
  return value;
}

function userAgent() {
  // SENTINEL_CONTACT_EMAIL is the pre-rename name, still honoured.
  const contact =
    process.env.SENTINEL_CONTACT_EMAIL || process.env.SENTINEL_CONTACT_EMAIL;
  return contact ? `Sentinel/0.1 (${contact})` : 'Sentinel/0.1 (hackathon prototype)';
}

async function waitForNominatimSlot() {
  const waitMs = Math.max(
    0,
    PUBLIC_NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimRequestAt)
  );
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastNominatimRequestAt = Date.now();
}

function serializedNominatimRequest(callback) {
  const request = nominatimQueue.then(async () => {
    await waitForNominatimSlot();
    return callback();
  });
  nominatimQueue = request.catch(() => undefined);
  return request;
}

async function searchMapbox(query, { limit, language }) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return [];

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', query);
  url.searchParams.set('access_token', token);
  url.searchParams.set('autocomplete', 'false');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('language', language);

  const payload = await fetchJson('Mapbox Geocoding', url);
  return (payload?.features || []).flatMap((feature) => {
    const coordinate = coordinateFromInput(feature?.geometry, 'geocoder result');
    if (!coordinate) return [];
    const properties = feature.properties || {};
    return [
      {
        ...placeFromCoordinate(
          coordinate,
          properties.full_address || feature.place_name || properties.name || feature.name,
          'mapbox'
        ),
        id: feature.id,
        address: properties.full_address || feature.place_name,
        attribution: '© Mapbox and its data suppliers'
      }
    ];
  });
}

async function searchNominatim(query, { limit, language }) {
  const baseUrl = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
  const url = new URL('/search', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('accept-language', language);

  const payload = await serializedNominatimRequest(() =>
    fetchJson('Nominatim', url, {
      headers: {
        'User-Agent': userAgent(),
        Referer: process.env.APP_BASE_URL || 'http://localhost:3000/'
      }
    })
  );

  return (payload?.features || []).flatMap((feature) => {
    const coordinate = coordinateFromInput(feature?.geometry, 'geocoder result');
    if (!coordinate) return [];
    const properties = feature.properties || {};
    return [
      {
        ...placeFromCoordinate(coordinate, properties.display_name, 'nominatim'),
        id: String(properties.place_id ?? feature.id ?? ''),
        address: properties.display_name,
        category: properties.category,
        placeType: properties.type,
        attribution: '© OpenStreetMap contributors'
      }
    ];
  });
}

export async function searchPlaces(input, { limit = 5, language = 'en', allowPublicFallback = true } = {}) {
  const coordinate = coordinateFromInput(input);
  if (coordinate) {
    const suppliedName = input && typeof input === 'object' ? input.name : undefined;
    return [placeFromCoordinate(coordinate, suppliedName)];
  }

  const query = normalizedQuery(input);
  if (query.length < 2 || query.length > 240) {
    throw new RoutingInputError('Enter a place name, street address, or latitude/longitude pair.', {
      field: 'query'
    });
  }

  const safeLimit = Math.min(8, Math.max(1, Number.parseInt(limit, 10) || 5));
  const hasMapbox = Boolean(process.env.MAPBOX_ACCESS_TOKEN);
  if (!hasMapbox && !allowPublicFallback) {
    throw new RoutingProviderError(
      'Geocoding',
      'MAPBOX_ACCESS_TOKEN is required when public geocoding fallback is disabled.'
    );
  }

  if (hasMapbox) {
    try {
      const mapboxResults = await searchMapbox(query, { limit: safeLimit, language });
      if (mapboxResults.length) return mapboxResults;
      if (!allowPublicFallback) {
        throw new RoutingInputError(`No location matched “${query}”. Try a more specific address.`, {
          field: 'query'
        });
      }
    } catch (error) {
      if (!allowPublicFallback) throw error;
    }
  }

  const key = cacheKey('nominatim', query, safeLimit);
  const cached = readCache(key);
  if (cached) return cached;
  const results = await searchNominatim(query, { limit: safeLimit, language });

  if (!results.length) {
    throw new RoutingInputError(`No location matched “${query}”. Try a more specific address.`, {
      field: 'query'
    });
  }

  return writeCache(key, results);
}

export async function resolvePlace(input, options = {}) {
  const results = await searchPlaces(input, { ...options, limit: 1 });
  return results[0];
}
